"""Section A — Authentication: register / login / logout / refresh / me."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Cookie, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.problem import ProblemException
from ...config import settings
from ...deps import CurrentUser, current_user, get_session
from ...repositories.oauth import OAuthIdentityRepository
from ...repositories.tenants import TenantRepository
from ...repositories.two_factor import TwoFactorRepository
from ...repositories.users import UserRepository
from ...schemas.auth import (
    LoginRequest,
    LoginResponse,
    MeResponse,
    RefreshResponse,
    RegisterRequest,
    RegisterResponse,
    TenantBrief,
    UserSummary,
)
from ...services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=token,
        max_age=settings.refresh_ttl_seconds,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        path="/",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path="/",
        secure=settings.cookie_secure,
        httponly=True,
        samesite="strict",
    )


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Self-register a new user",
)
async def register(
    payload: RegisterRequest,
    session: AsyncSession = Depends(get_session),
) -> RegisterResponse:
    auth = AuthService(session)
    user = await auth.register(
        email=payload.email,
        password=payload.password,
        display_name=payload.display_name,
        tenant_slug=payload.tenant_slug,
        locale=payload.locale,
    )
    return RegisterResponse(user_id=user.id, email_verification_required=True)


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Email + password login (with optional TOTP)",
)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> LoginResponse:
    auth = AuthService(session)
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    user, access, refresh, ttl = await auth.login(
        email=payload.email,
        password=payload.password,
        tenant_slug=payload.tenant_slug,
        totp_code=payload.totp_code,
        ip=ip,
        user_agent=ua,
    )
    _set_refresh_cookie(response, refresh)
    return LoginResponse(
        access_token=access,
        expires_in=ttl,
        user=UserSummary(
            id=user.id,
            email=user.email,
            display_name=user.display_name,
            avatar_url=user.avatar_url,
            global_role=user.global_role,
            tenant_id=user.tenant_id,
        ),
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="End the current session (revoke refresh token)",
)
async def logout(
    response: Response,
    session: AsyncSession = Depends(get_session),
    refresh: Optional[str] = Cookie(default=None, alias=settings.refresh_cookie_name),
) -> Response:
    auth = AuthService(session)
    await auth.logout(refresh_token=refresh)
    _clear_refresh_cookie(response)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/refresh",
    response_model=RefreshResponse,
    summary="Rotate refresh token, get a fresh access token",
)
async def refresh(
    response: Response,
    session: AsyncSession = Depends(get_session),
    refresh_token: Optional[str] = Cookie(
        default=None, alias=settings.refresh_cookie_name
    ),
) -> RefreshResponse:
    if not refresh_token:
        raise ProblemException(
            status=401,
            code="UNAUTHENTICATED",
            title="Refresh cookie missing",
        )
    auth = AuthService(session)
    access, new_refresh, ttl = await auth.refresh(refresh_token=refresh_token)
    _set_refresh_cookie(response, new_refresh)
    return RefreshResponse(access_token=access, expires_in=ttl)


@router.get("/me", response_model=MeResponse, summary="Current user (JWT + DB lookup)")
async def me(
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> MeResponse:
    users = UserRepository(session)
    tenants = TenantRepository(session)
    two_fa_repo = TwoFactorRepository(session)
    oauth_repo = OAuthIdentityRepository(session)
    db_user = await users.get(user.id)
    if db_user is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")
    tenant = await tenants.get(db_user.tenant_id)
    if tenant is None:
        raise ProblemException(
            status=404, code="NOT_FOUND", title="Tenant not found"
        )
    two_fa = await two_fa_repo.get(user.id)
    linked = [oid.provider for oid in await oauth_repo.list_for_user(user.id)]
    return MeResponse(
        id=db_user.id,
        email=db_user.email,
        display_name=db_user.display_name,
        avatar_url=db_user.avatar_url,
        locale=db_user.locale,
        timezone=db_user.timezone,
        global_role=db_user.global_role,
        course_roles=user.course_roles,
        tenant=TenantBrief(id=tenant.id, slug=tenant.slug, name=tenant.name),
        email_verified=db_user.email_verified_at is not None,
        two_factor_enabled=bool(two_fa and two_fa.enabled_at),
        linked_oauth=linked,
        last_login_at=db_user.last_login_at,
    )


# -------- Service-to-service token --------


@router.post(
    "/service-token",
    summary="Mint a long-lived super_admin JWT for an internal service",
)
async def issue_service_token(
    request: Request,
    body: dict[str, str] | None = None,
) -> dict[str, object]:
    """Internal sidecars / schedulers obtain a super_admin token here.

    Auth is via the ``X-Service-Secret`` header matching ``settings.service_auth_secret``;
    no user authentication is involved. The resulting JWT is *long-lived*
    (``service_token_ttl_seconds`` — 24h by default) so background workers
    don't need to refresh mid-cycle. Rotate ``SERVICE_AUTH_SECRET`` to
    invalidate everything at once.
    """
    from datetime import datetime, timedelta, timezone

    from ...common.security import issue_access_token

    secret = request.headers.get("x-service-secret")
    if not secret or secret != settings.service_auth_secret:
        raise ProblemException(
            status=401,
            code="UNAUTHENTICATED",
            title="Bad service secret",
        )
    payload = body or {}
    service_name = (payload.get("service_name") or "unknown").strip().lower()
    if not service_name or len(service_name) > 64:
        raise ProblemException(
            status=400, code="BAD_REQUEST", title="service_name required"
        )

    # Optional impersonation: a service can ask for a token that acts as
    # a specific user in a specific tenant (e.g. the reporting scheduler
    # needs to fire a grades export *as the teacher* who saved the
    # binding, since RBAC at the data layer expects a real ``tenant_id``
    # and ``user_id``). Defaults preserve the legacy behaviour —
    # ``tenant_id=system``, ``user_id=svc:<name>`` — so existing callers
    # are unaffected.
    as_tenant = (payload.get("tenant_id") or "system").strip()
    as_user = (payload.get("as_user_id") or f"svc:{service_name}").strip()
    as_role = (payload.get("global_role") or "super_admin").strip()

    now = datetime.now(timezone.utc)
    exp = now + timedelta(seconds=settings.service_token_ttl_seconds)
    token = issue_access_token(
        user_id=as_user,
        tenant_id=as_tenant,
        global_role=as_role,
        course_roles={},
        extra_claims={"is_service": True, "svc": service_name},
    )
    # Override TTL: issue_access_token uses jwt_access_ttl_seconds (15 min);
    # for service tokens we re-issue with the longer TTL claim by re-encoding.
    # Simplest: monkeypatch the exp claim by decoding+re-encoding.
    import jwt as pyjwt
    parts = token.split(".")
    if len(parts) == 3:
        # Re-mint cleanly: just call the lower-level encoder with new exp.
        from ...common.security import get_keys
        priv, _ = get_keys()
        new_payload = pyjwt.decode(
            token, options={"verify_signature": False, "verify_aud": False, "verify_iss": False}
        )
        new_payload["exp"] = int(exp.timestamp())
        token = pyjwt.encode(
            new_payload,
            priv,
            algorithm=settings.jwt_alg,
            headers={"kid": settings.jwt_kid, "typ": "JWT"},
        )
    return {
        "access_token": token,
        "expires_in": settings.service_token_ttl_seconds,
        "token_type": "Bearer",
    }
