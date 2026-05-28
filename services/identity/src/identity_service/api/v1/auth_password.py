"""Section B — Password recovery & change."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.events import publish_user_event
from ...common.ids import token_id
from ...common.problem import ProblemException
from ...common.security import (
    hash_password,
    hash_token,
    new_opaque_token,
    verify_password,
)
from ...deps import CurrentUser, current_user, get_session
from ...models import PasswordResetToken
from ...repositories.sessions import SessionRepository
from ...repositories.tenants import TenantRepository
from ...repositories.tokens import PasswordResetTokenRepository
from ...repositories.users import UserRepository
from ...schemas.auth import (
    PasswordChangeRequest,
    PasswordForgotRequest,
    PasswordResetRequest,
)
from ...services.email_service import EmailService, build_frontend_url

router = APIRouter(prefix="/auth/password", tags=["auth"])


@router.post(
    "/forgot",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Request a password-reset email",
)
async def password_forgot(
    payload: PasswordForgotRequest,
    session: AsyncSession = Depends(get_session),
) -> Response:
    tenants = TenantRepository(session)
    users = UserRepository(session)
    tokens = PasswordResetTokenRepository(session)
    email = EmailService()
    # Resolve the user. Two code paths:
    #   * tenant_slug provided — admin-style lookup, same as before.
    #   * tenant_slug omitted — the SPA's recovery form. We do the same
    #     unique-email lookup login uses, so self-registered users
    #     (planted in the default «public» tenant) don't have to know
    #     their tenant slug. Ambiguous email → silently no-op; the user
    #     either passes an explicit slug or contacts admin.
    user = None
    if payload.tenant_slug:
        tenant = await tenants.get_by_slug(payload.tenant_slug)
        if tenant is not None:
            user = await users.get_by_email(tenant.id, payload.email)
    else:
        user = await users.find_unique_active_by_email(payload.email)
    # Always 202 — never reveal whether an email exists.
    if user is not None:
        plain = new_opaque_token(prefix="prt_")
        await tokens.add(
            PasswordResetToken(
                id=token_id(),
                user_id=user.id,
                token_hash=hash_token(plain),
                expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            )
        )
        await email.send_password_reset(
            to=user.email,
            reset_url=build_frontend_url("/auth/reset", plain),
        )
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post(
    "/reset",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Consume reset token + set new password",
)
async def password_reset(
    payload: PasswordResetRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> Response:
    tokens = PasswordResetTokenRepository(session)
    users = UserRepository(session)
    sessions = SessionRepository(session)
    record = await tokens.get_by_hash(hash_token(payload.token))
    if record is None or record.expires_at <= datetime.now(timezone.utc).replace(
        tzinfo=record.expires_at.tzinfo
    ):
        raise ProblemException(
            status=400,
            code="BAD_REQUEST",
            title="Invalid or expired token",
        )
    user = await users.get(record.user_id)
    if user is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")
    user.password_hash = hash_password(payload.new_password)
    await tokens.mark_used(record.id)
    await sessions.revoke_all_for_user(user.id)
    await publish_user_event(
        request,
        "identity.user.password_changed.v1",
        data={"user_id": user.id, "reason": "reset", "sessions_revoked": True},
        tenant_id=user.tenant_id,
        subject=f"users/{user.id}",
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/change",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change own password (requires current password)",
)
async def password_change(
    payload: PasswordChangeRequest,
    request: Request,
    me: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    users = UserRepository(session)
    sessions = SessionRepository(session)
    user = await users.get(me.id)
    if user is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")
    if not verify_password(payload.current_password, user.password_hash):
        raise ProblemException(
            status=401,
            code="UNAUTHENTICATED",
            title="Current password is incorrect",
        )
    user.password_hash = hash_password(payload.new_password)
    # Force-logout all other sessions: revoking everything is the safest default
    # — the user's current session was rotated already so they keep their seat.
    await sessions.revoke_all_for_user(user.id)
    await publish_user_event(
        request,
        "identity.user.password_changed.v1",
        data={"user_id": user.id, "reason": "self_change", "sessions_revoked": True},
        tenant_id=user.tenant_id,
        subject=f"users/{user.id}",
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
