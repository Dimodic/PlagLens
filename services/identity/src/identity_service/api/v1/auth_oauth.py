"""Section E — OAuth (Google / Yandex / Stepik / GitHub)."""
from __future__ import annotations

from typing import Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Cookie, Depends, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.problem import ProblemException
from ...config import settings
from ...deps import CurrentUser, current_user, get_session
from ...schemas.auth import (
    OAuthAuthorizeResponse,
    OAuthCallbackResponse,
    OAuthLinkConfirmRequest,
    UserSummary,
)
from ...services.oauth_service import (
    OAuthService,
    assert_provider,
)

router = APIRouter(prefix="/auth/oauth", tags=["auth"])


# --------------------------------------------------------------------------- #
# Cookie helpers (mirror /auth/login behaviour for refresh-token cookies)
# --------------------------------------------------------------------------- #
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


def _build_service(request: Request, session: AsyncSession) -> OAuthService:
    redis = getattr(request.app.state, "redis", None)
    producer = getattr(request.app.state, "producer", None)
    return OAuthService(session, redis=redis, producer=producer)


# --------------------------------------------------------------------------- #
# AUTHORIZE — initiate the OAuth dance
# --------------------------------------------------------------------------- #
@router.get(
    "/{provider}/authorize",
    summary="Start OAuth flow (302 to provider authorize URL)",
)
async def oauth_authorize(
    provider: str,
    request: Request,
    return_url: str | None = None,
    redirect_url: str | None = None,
    tenant_slug: str | None = None,
    format: str = "redirect",
    session: AsyncSession = Depends(get_session),
) -> Response:
    """Initiate OAuth.

    By default returns a 302 to the provider; pass ``?format=json`` to receive
    a JSON envelope (used by the link-flow endpoint and SPA debug tools).
    """
    assert_provider(provider)
    svc = _build_service(request, session)
    chosen = redirect_url or return_url
    authorize_url, state = await svc.start_authorize(
        provider, redirect_url=chosen, tenant_slug=tenant_slug
    )
    if format == "json":
        return Response(
            content=OAuthAuthorizeResponse(
                authorize_url=authorize_url,
                state=state,
                expires_in=settings.oauth_state_ttl_seconds,
            ).model_dump_json(),
            media_type="application/json",
        )
    return RedirectResponse(authorize_url, status_code=status.HTTP_302_FOUND)


# --------------------------------------------------------------------------- #
# CALLBACK — the provider returns here with ?code & ?state
# --------------------------------------------------------------------------- #
@router.get(
    "/{provider}/callback",
    summary="OAuth callback — exchange code for tokens, log user in",
)
async def oauth_callback(
    provider: str,
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    format: str = "redirect",
    session: AsyncSession = Depends(get_session),
) -> Response:
    assert_provider(provider)
    if error:
        raise ProblemException(
            status=400,
            code="OAUTH_PROVIDER_ERROR",
            title="OAuth provider returned an error",
            detail=f"{error}: {error_description or ''}".strip(": "),
        )
    if not code or not state:
        raise ProblemException(
            status=400,
            code="BAD_REQUEST",
            title="Missing 'code' or 'state'",
        )

    svc = _build_service(request, session)
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    result = await svc.handle_callback(
        provider, code=code, state=state, ip=ip, user_agent=ua
    )

    response: Response
    if result.link_required:
        # User must confirm the link on the frontend.
        if format == "json":
            response = Response(
                content=OAuthCallbackResponse(
                    access_token="",
                    expires_in=0,
                    user=_user_summary(result.user),
                    linked=False,
                    is_new_user=False,
                    link_required=True,
                    link_token=result.link_token,
                ).model_dump_json(),
                media_type="application/json",
            )
            return response
        target = _build_redirect(
            result.redirect_url,
            params={
                "login": "link_required",
                "link_token": result.link_token or "",
                "provider": provider,
            },
        )
        return RedirectResponse(target, status_code=status.HTTP_302_FOUND)

    if format == "json":
        body = OAuthCallbackResponse(
            access_token=result.access_token,
            expires_in=result.access_ttl_seconds,
            user=_user_summary(result.user),
            linked=False,
            is_new_user=result.is_new_user,
            link_required=False,
        )
        response = Response(
            content=body.model_dump_json(), media_type="application/json"
        )
        _set_refresh_cookie(response, result.refresh_token)
        return response

    target = _build_redirect(
        result.redirect_url,
        params={"login": "success"},
    )
    response = RedirectResponse(target, status_code=status.HTTP_302_FOUND)
    _set_refresh_cookie(response, result.refresh_token)
    return response


# --------------------------------------------------------------------------- #
# LINK — authenticated user starts a fresh OAuth dance to attach a provider
# --------------------------------------------------------------------------- #
@router.post(
    "/{provider}/link",
    response_model=OAuthAuthorizeResponse,
    summary="Authenticated: open a link flow for the current user",
)
async def oauth_link(
    provider: str,
    request: Request,
    return_url: str | None = None,
    me: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> OAuthAuthorizeResponse:
    assert_provider(provider)
    svc = _build_service(request, session)
    authorize_url, state = await svc.start_authorize(
        provider,
        redirect_url=return_url,
        tenant_slug=None,
        link_user_id=me.id,
    )
    return OAuthAuthorizeResponse(
        authorize_url=authorize_url,
        state=state,
        expires_in=settings.oauth_state_ttl_seconds,
    )


@router.post(
    "/{provider}/link/confirm",
    response_model=OAuthCallbackResponse,
    summary="Confirm an OAuth link after a `link_required` callback",
)
async def oauth_link_confirm(
    provider: str,
    payload: OAuthLinkConfirmRequest,
    request: Request,
    response: Response,
    me: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> OAuthCallbackResponse:
    assert_provider(provider)
    svc = _build_service(request, session)
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    result = await svc.confirm_link(
        link_token=payload.link_token,
        user_id_str=me.id,
        ip=ip,
        user_agent=ua,
    )
    _set_refresh_cookie(response, result.refresh_token)
    return OAuthCallbackResponse(
        access_token=result.access_token,
        expires_in=result.access_ttl_seconds,
        user=_user_summary(result.user),
        linked=True,
        is_new_user=False,
    )


# --------------------------------------------------------------------------- #
# UNLINK
# --------------------------------------------------------------------------- #
@router.delete(
    "/{provider}/unlink",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unlink OAuth provider from current user",
)
async def oauth_unlink(
    provider: str,
    request: Request,
    me: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
    refresh_cookie: Optional[str] = Cookie(
        default=None, alias=settings.refresh_cookie_name
    ),
) -> Response:
    assert_provider(provider)
    svc = _build_service(request, session)
    await svc.unlink(user_id_str=me.id, provider_name=provider)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def _user_summary(user) -> UserSummary:
    return UserSummary(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        global_role=user.global_role,
        tenant_id=user.tenant_id,
    )


def _build_redirect(redirect_url: str | None, *, params: dict[str, str]) -> str:
    base = redirect_url or "/"
    sep = "&" if "?" in base else "?"
    qs = urlencode({k: v for k, v in params.items() if v != ""})
    if not qs:
        return base
    return f"{base}{sep}{qs}"
