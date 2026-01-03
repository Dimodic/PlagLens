"""Section H — Self-service ``/users/me`` endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.pagination import Page, Pagination
from ...common.problem import ProblemException
from ...deps import CurrentUser, current_user, get_session
from ...repositories.oauth import OAuthIdentityRepository
from ...repositories.sessions import SessionRepository
from ...repositories.tenants import TenantRepository
from ...repositories.two_factor import TwoFactorRepository
from ...repositories.users import UserRepository
from ...schemas.auth import MeResponse, TenantBrief
from ...schemas.sessions import SessionOut
from ...schemas.users import UserUpdate

router = APIRouter(prefix="/users/me", tags=["me"])


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
    if payload.global_role is not None and user.global_role not in ("admin", "super_admin"):
        raise ProblemException(
            status=403, code="FORBIDDEN", title="Cannot self-promote role"
        )
    return await me(user=user, session=session)  # reuse builder


@router.post(
    "/avatar",
    summary="Upload avatar (multipart). Stores metadata only — TODO: MinIO upload",
)
async def upload_avatar(
    file: UploadFile = File(...),  # noqa: B008
    user: CurrentUser = Depends(current_user),  # noqa: ARG001
) -> dict[str, str]:
    # TODO: stream file to MinIO and record avatar_url
    return {"filename": file.filename or "avatar", "status": "accepted"}


@router.delete(
    "/avatar",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove avatar",
)
async def delete_avatar(
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    users = UserRepository(session)
    db_user = await users.get(user.id)
    if db_user is not None:
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
    rows = await sessions.list_for_user(user.id)
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
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    sessions = SessionRepository(session)
    sess = await sessions.get(session_id)
    if sess is None or sess.user_id != user.id:
        raise ProblemException(status=404, code="NOT_FOUND", title="Session not found")
    await sessions.revoke(sess.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/sessions:revokeAll",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke all sessions except the current one",
)
async def revoke_all_my_sessions(
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    sessions = SessionRepository(session)
    # We don't currently track which session id maps to the active access JWT;
    # in production, /auth/login embeds the session_id as a claim. For now the
    # caller can re-authenticate.
    await sessions.revoke_all_for_user(user.id, except_session_id=None)
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
