"""Section H — Self-service ``/users/me`` endpoints."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, File, Request, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.events import make_event
from ...common.pagination import Page, Pagination
from ...common.problem import ProblemException
from ...config import settings
from ...deps import CurrentUser, current_user, get_session
from ...repositories.oauth import OAuthIdentityRepository
from ...repositories.sessions import SessionRepository
from ...repositories.tenants import TenantRepository
from ...repositories.two_factor import TwoFactorRepository
from ...repositories.users import UserRepository
from ...schemas.auth import MeResponse, TenantBrief
from ...schemas.sessions import SessionOut
from ...schemas.users import UserUpdate
from ...services.avatar_service import AvatarService, AvatarStorageError

router = APIRouter(prefix="/users/me", tags=["me"])

logger = logging.getLogger(__name__)


async def _emit_session_revoked(
    request: Request, *, user: CurrentUser, data: dict
) -> None:
    """Best-effort ``identity.session.revoked.v1`` (rides the user topic).

    Mirrors ``AuthService._emit_user_event`` so self-service session
    termination is auditable, same as logout.
    """
    producer = getattr(request.app.state, "producer", None)
    if producer is None:
        return
    event = make_event(
        "identity.session.revoked.v1",
        data={"user_id": user.id, **data},
        tenant_id=user.tenant_id,
        subject=f"users/{user.id}",
    )
    try:
        await producer.publish(settings.kafka_topic_user, event)
    except Exception as exc:  # pragma: no cover - producer is best-effort
        logger.warning("Failed to publish session.revoked: %s", exc)


@router.get(
    "",
    response_model=MeResponse,
    summary="Current user (alias for /auth/me)",
)
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
        raise ProblemException(status=404, code="NOT_FOUND", title="Tenant not found")
    two_fa = await two_fa_repo.get(user.id)
    oauth_links = await oauth_repo.list_for_user(user.id)
    linked = [oid.provider for oid in oauth_links]

    # External handle: prefer Telegram, since it's the only provider that
    # mints a placeholder email — for Google/Yandex/GitHub the user's real
    # email is already the natural identifier.
    external_handle: str | None = None
    tg = next((o for o in oauth_links if o.provider == "telegram"), None)
    if tg is not None:
        raw = tg.raw_profile or {}
        # Telegram payload fields: username (without @), first_name, last_name.
        username = (raw.get("username") or "").strip()
        if username:
            external_handle = username
        else:
            first = (raw.get("first_name") or "").strip()
            last = (raw.get("last_name") or "").strip()
            full = f"{first} {last}".strip()
            external_handle = full or None

    email_is_placeholder = db_user.email.endswith("@telegram.plaglens.local")

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
        email_is_placeholder=email_is_placeholder,
        external_handle=external_handle,
    )


@router.patch(
    "",
    response_model=MeResponse,
    summary="Update own profile",
)
async def patch_me(
    payload: UserUpdate,
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> MeResponse:
    users = UserRepository(session)
    db_user = await users.get(user.id)
    if db_user is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")
    if payload.display_name is not None:
        db_user.display_name = payload.display_name
    if payload.locale is not None:
        db_user.locale = payload.locale
    if payload.timezone is not None:
        db_user.timezone = payload.timezone
    if payload.avatar_url is not None:
        db_user.avatar_url = payload.avatar_url
    # global_role on PATCH /me is rejected for non-admins below
    if payload.global_role is not None and user.global_role not in ("admin",):
        raise ProblemException(
            status=403, code="FORBIDDEN", title="Cannot self-promote role"
        )
    return await me(user=user, session=session)  # reuse builder


@router.post(
    "/avatar",
    summary="Upload avatar (multipart). Stores in MinIO, records presigned URL.",
)
async def upload_avatar(
    file: UploadFile = File(...),  # noqa: B008
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> dict[str, str]:
    import asyncio

    content_type = (file.content_type or "").lower()
    if not AvatarService.is_supported(content_type):
        raise ProblemException(
            status=415,
            code="UNSUPPORTED_MEDIA_TYPE",
            title="Avatar must be PNG, JPEG, WebP, or GIF",
        )
    raw = await file.read()
    if len(raw) > settings.avatar_max_size_bytes:
        raise ProblemException(
            status=413,
            code="PAYLOAD_TOO_LARGE",
            title="Avatar exceeds the 2 MiB limit",
            detail=f"received {len(raw)} bytes",
        )
    if not raw:
        raise ProblemException(
            status=400,
            code="BAD_REQUEST",
            title="Empty file",
        )
    avatars = AvatarService()
    try:
        key, url = await asyncio.to_thread(
            avatars.put, user_id=user.id, data=raw, content_type=content_type
        )
    except AvatarStorageError as exc:
        logger.warning("avatar upload failed for user=%s: %s", user.id, exc)
        raise ProblemException(
            status=502,
            code="UPSTREAM_UNAVAILABLE",
            title="Avatar storage unavailable",
        ) from exc

    users = UserRepository(session)
    db_user = await users.get(user.id)
    if db_user is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")
    db_user.avatar_url = url
    return {"avatar_url": url, "key": key}


@router.delete(
    "/avatar",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove avatar",
)
async def delete_avatar(
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    import asyncio

    users = UserRepository(session)
    db_user = await users.get(user.id)
    if db_user is not None and db_user.avatar_url:
        # Best-effort wipe from MinIO; never fail the API call if storage is down.
        try:
            avatars = AvatarService()
            await asyncio.to_thread(
                avatars.delete, key=f"users/{user.id}/avatar.png"
            )
        except Exception as exc:  # pragma: no cover - best-effort
            logger.info("avatar delete from storage skipped: %s", exc)
        db_user.avatar_url = None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/sessions",
    response_model=Page[SessionOut],
    summary="My sessions",
)
async def my_sessions(
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Page[SessionOut]:
    sessions = SessionRepository(session)
    # Self-service view: hide revoked + expired sessions. The Безопасность
    # block on Profile is "what's currently logged in as me" — surfacing
    # past sessions there confuses users (they revoke a row, the click
    # succeeds, the row stays, they file a bug).
    rows = await sessions.list_active_for_user(user.id)
    return Page[SessionOut](
        data=[
            SessionOut(
                id=s.id,
                user_id=s.user_id,
                ip=s.ip,
                user_agent=s.user_agent,
                created_at=s.created_at,
                last_used_at=s.last_used_at,
                expires_at=s.expires_at,
                revoked_at=s.revoked_at,
                is_current=False,
            )
            for s in rows
        ],
        pagination=Pagination(limit=len(rows), has_more=False, next_cursor=None),
    )


@router.delete(
    "/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Terminate one of my sessions",
)
async def terminate_my_session(
    session_id: str,
    request: Request,
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    sessions = SessionRepository(session)
    sess = await sessions.get(session_id)
    if sess is None or sess.user_id != user.id:
        raise ProblemException(status=404, code="NOT_FOUND", title="Session not found")
    await sessions.revoke(sess.id)
    await _emit_session_revoked(request, user=user, data={"session_id": sess.id})
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/sessions:revokeAll",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke all sessions except the current one",
)
async def revoke_all_my_sessions(
    request: Request,
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    sessions = SessionRepository(session)
    # We don't currently track which session id maps to the active access JWT;
    # in production, /auth/login embeds the session_id as a claim. For now the
    # caller can re-authenticate.
    revoked = await sessions.revoke_all_for_user(user.id, except_session_id=None)
    await _emit_session_revoked(
        request, user=user, data={"scope": "all", "revoked_count": revoked}
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/course-roles",
    summary="Full course-role list (in case JWT was truncated)",
)
async def my_course_roles(
    user: CurrentUser = Depends(current_user),
) -> dict[str, dict[str, str]]:
    # TODO: cross-call Course Service for the full set; for now mirror the JWT.
    return {"course_roles": user.course_roles}


@router.get(
    "/notifications-settings",
    summary="Notification preferences (proxy to Notification Service)",
)
async def my_notifications_settings(
    user: CurrentUser = Depends(current_user),  # noqa: ARG001
) -> dict[str, str]:
    raise ProblemException(
        status=501,
        code="NOT_IMPLEMENTED",
        title="Notification Service is not yet online",
    )
