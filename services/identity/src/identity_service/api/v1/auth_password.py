"""Section B — Password recovery & change."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

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
from ...services.email_service import EmailService

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
    tenant = await tenants.get_by_slug(payload.tenant_slug)
    # Always 202 — never reveal whether an email exists.
    if tenant is not None:
        user = await users.get_by_email(tenant.id, payload.email)
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
            # TODO: build a real frontend URL; identity holds only the token.
            await email.send_password_reset(
                to=user.email, reset_url=f"https://app.plaglens.local/reset?t={plain}"
            )
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post(
    "/reset",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Consume reset token + set new password",
)
async def password_reset(
    payload: PasswordResetRequest,
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
    # TODO: emit identity.user.password_changed.v1
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/change",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Change own password (requires current password)",
)
async def password_change(
    payload: PasswordChangeRequest,
    me: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    users = UserRepository(session)
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
    # TODO: emit identity.user.password_changed.v1; force_logout other sessions
    return Response(status_code=status.HTTP_204_NO_CONTENT)
