"""Section D — Two-factor authentication (TOTP)."""
from __future__ import annotations

import secrets as pysecrets
from datetime import datetime, timezone

import pyotp
from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.problem import ProblemException
from ...common.security import encrypt_secret, verify_password
from ...config import settings
from ...deps import CurrentUser, current_user, get_session
from ...models import TwoFactorSecret
from ...repositories.two_factor import TwoFactorRepository
from ...repositories.users import UserRepository
from ...schemas.auth import (
    PasswordChangeRequest,
    TwoFactorBackupCodes,
    TwoFactorEnableRequest,
    TwoFactorEnrollResponse,
    TwoFactorVerifyRequest,
    TwoFactorVerifyResponse,
    UserSummary,
)
from ...services.auth_service import AuthService, verify_totp

router = APIRouter(prefix="/auth/2fa", tags=["auth"])


def _new_backup_codes(count: int = 10) -> list[str]:
    return [pysecrets.token_hex(4).upper() for _ in range(count)]


@router.post(
    "/enroll",
    response_model=TwoFactorEnrollResponse,
    summary="Generate TOTP secret + otpauth URI (not yet enabled)",
)
async def two_factor_enroll(
    me: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> TwoFactorEnrollResponse:
    repo = TwoFactorRepository(session)
    users = UserRepository(session)
    user = await users.get(me.id)
    if user is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")
    secret = pyotp.random_base32()
    await repo.upsert(
        TwoFactorSecret(
            user_id=user.id,
            secret_encrypted=encrypt_secret(secret),
            backup_codes=[],
            enabled_at=None,
        )
    )
    uri = pyotp.totp.TOTP(secret).provisioning_uri(
        name=user.email, issuer_name=settings.totp_issuer
    )
    return TwoFactorEnrollResponse(secret=secret, otpauth_uri=uri, qr_svg=None)


@router.post(
    "/enable",
    response_model=TwoFactorBackupCodes,
    summary="Confirm enrollment with one TOTP code",
)
async def two_factor_enable(
    payload: TwoFactorEnableRequest,
    me: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> TwoFactorBackupCodes:
    repo = TwoFactorRepository(session)
    record = await repo.get(me.id)
    if record is None:
        raise ProblemException(
            status=400, code="BAD_REQUEST", title="2FA not enrolled"
        )
    # Confirm the user actually possesses the TOTP device by validating the
    # supplied code against the secret stored at /enroll. Until this check
    # passes the row exists but ``enabled_at`` stays NULL — login still
    # ignores it (and ``/disable`` would 404 because of that).
    if not verify_totp(record.secret_encrypted, payload.totp_code):
        raise ProblemException(
            status=401, code="UNAUTHENTICATED", title="Invalid TOTP code"
        )
    codes = _new_backup_codes()
    record.backup_codes = codes
    record.enabled_at = datetime.now(timezone.utc)
    await repo.upsert(record)
    return TwoFactorBackupCodes(codes=codes)


@router.post(
    "/disable",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Disable 2FA (requires password)",
)
async def two_factor_disable(
    payload: PasswordChangeRequest,  # reuse: current_password is required
    me: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    users = UserRepository(session)
    repo = TwoFactorRepository(session)
    user = await users.get(me.id)
    if user is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")
    if not verify_password(payload.current_password, user.password_hash):
        raise ProblemException(
            status=401, code="UNAUTHENTICATED", title="Wrong password"
        )
    await repo.delete(me.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/backup-codes",
    response_model=TwoFactorBackupCodes,
    summary="Regenerate backup codes (invalidates old)",
)
async def two_factor_backup_codes(
    me: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> TwoFactorBackupCodes:
    repo = TwoFactorRepository(session)
    record = await repo.get(me.id)
    if record is None or record.enabled_at is None:
        raise ProblemException(
            status=400, code="BAD_REQUEST", title="2FA is not enabled"
        )
    codes = _new_backup_codes()
    record.backup_codes = codes
    await repo.upsert(record)
    return TwoFactorBackupCodes(codes=codes)


@router.post(
    "/verify",
    response_model=TwoFactorVerifyResponse,
    summary="Submit second-factor code during login",
)
async def two_factor_verify(
    payload: TwoFactorVerifyRequest,
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> TwoFactorVerifyResponse:
    """Exchange the one-shot ``mfa_token`` issued by ``/auth/login`` for an
    access + refresh pair, after verifying the TOTP code or a backup code.

    Sets the refresh cookie on success; the request body never carries the
    refresh token. Single-use: mfa_token is deleted on success and backup
    codes are consumed in-place.
    """
    auth = AuthService(session, producer=getattr(request.app.state, "producer", None))
    ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    redis = getattr(request.app.state, "redis", None)
    user, access, refresh, ttl = await auth.complete_mfa_login(
        mfa_token=payload.mfa_token,
        totp_code=payload.totp_code,
        backup_code=payload.backup_code,
        redis=redis,
        ip=ip,
        user_agent=ua,
    )
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=refresh,
        max_age=settings.refresh_ttl_seconds,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/",
    )
    return TwoFactorVerifyResponse(
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
