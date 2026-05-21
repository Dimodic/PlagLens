"""Section C — Email verification & change."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.events import publish_user_event
from ...common.ids import token_id
from ...common.problem import ProblemException
from ...common.security import hash_token, new_opaque_token
from ...deps import CurrentUser, current_user, get_session
from ...models import EmailVerifyToken
from ...repositories.tokens import EmailVerifyTokenRepository
from ...repositories.users import UserRepository
from ...schemas.auth import EmailChangeConfirm, EmailChangeRequest, EmailVerifyConfirm
from ...services.email_service import EmailService, build_frontend_url

router = APIRouter(prefix="/auth/email", tags=["auth"])


@router.post(
    "/verify/request",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Resend the email-verification link",
)
async def email_verify_request(
    me: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    users = UserRepository(session)
    tokens = EmailVerifyTokenRepository(session)
    email = EmailService()
    user = await users.get(me.id)
    if user is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")
    plain = new_opaque_token(prefix="evt_")
    await tokens.add(
        EmailVerifyToken(
            id=token_id(),
            user_id=user.id,
            email=user.email,
            token_hash=hash_token(plain),
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
        )
    )
    await email.send_email_verification(
        to=user.email, verify_url=build_frontend_url("/auth/verify", plain)
    )
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post(
    "/verify/confirm",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Confirm email with token from inbox",
)
async def email_verify_confirm(
    payload: EmailVerifyConfirm,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> Response:
    tokens = EmailVerifyTokenRepository(session)
    users = UserRepository(session)
    record = await tokens.get_by_hash(hash_token(payload.token))
    if record is None or record.expires_at <= datetime.now(timezone.utc).replace(
        tzinfo=record.expires_at.tzinfo
    ):
        raise ProblemException(
            status=400, code="BAD_REQUEST", title="Invalid or expired token"
        )
    user = await users.get(record.user_id)
    if user is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")
    user.email_verified_at = datetime.now(timezone.utc)
    await tokens.mark_used(record.id)
    await publish_user_event(
        request,
        "identity.user.email_verified.v1",
        data={"user_id": user.id, "email": user.email},
        tenant_id=user.tenant_id,
        subject=f"users/{user.id}",
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/change/request",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Send confirmation link to new email",
)
async def email_change_request(
    payload: EmailChangeRequest,
    me: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    tokens = EmailVerifyTokenRepository(session)
    email = EmailService()
    plain = new_opaque_token(prefix="ect_")
    await tokens.add(
        EmailVerifyToken(
            id=token_id(),
            user_id=me.id,
            email=payload.new_email,
            token_hash=hash_token(plain),
            expires_at=datetime.now(timezone.utc) + timedelta(hours=2),
        )
    )
    await email.send_email_change_confirmation(
        to=payload.new_email,
        confirm_url=build_frontend_url("/me/email-change", plain),
    )
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post(
    "/change/confirm",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Confirm email change",
)
async def email_change_confirm(
    payload: EmailChangeConfirm,
    session: AsyncSession = Depends(get_session),
) -> Response:
    tokens = EmailVerifyTokenRepository(session)
    users = UserRepository(session)
    record = await tokens.get_by_hash(hash_token(payload.token))
    if record is None or record.expires_at <= datetime.now(timezone.utc).replace(
        tzinfo=record.expires_at.tzinfo
    ):
        raise ProblemException(
            status=400, code="BAD_REQUEST", title="Invalid or expired token"
        )
    user = await users.get(record.user_id)
    if user is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")
    user.email = record.email.lower()
    user.email_verified_at = datetime.now(timezone.utc)
    await tokens.mark_used(record.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
