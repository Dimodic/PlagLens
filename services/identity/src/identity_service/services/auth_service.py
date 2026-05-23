"""Auth orchestration: register, login, refresh, MFA, password flows."""
from __future__ import annotations

import logging
import secrets as pysecrets
from datetime import datetime, timedelta, timezone
from typing import Any

import pyotp
from sqlalchemy.ext.asyncio import AsyncSession

from ..common.events import KafkaProducer, StubProducer, make_event
from ..common.ids import session_id, user_id
from ..common.problem import ProblemException
from ..common.security import (
    decrypt_secret,
    hash_password,
    hash_token,
    issue_access_token,
    new_refresh_token,
    verify_password,
)
from ..config import settings
from ..models import Session as DBSession
from ..models import User
from ..repositories.sessions import SessionRepository
from ..repositories.tenants import TenantRepository
from ..repositories.two_factor import TwoFactorRepository
from ..repositories.users import UserRepository

# ----- 2FA helpers ---------------------------------------------------------- #

MFA_TOKEN_TTL_SECONDS = 90
MFA_REDIS_KEY_PREFIX = "mfa:challenge:"
TOTP_VALID_WINDOW = 1  # accept the previous + next 30s step (clock skew)


def mfa_redis_key(token: str) -> str:
    return f"{MFA_REDIS_KEY_PREFIX}{token}"


def verify_totp(secret_encrypted: bytes, totp_code: str) -> bool:
    """Decrypt the stored TOTP secret and check the user-supplied code."""
    if not totp_code:
        return False
    try:
        secret = decrypt_secret(secret_encrypted)
    except Exception:
        return False
    try:
        return pyotp.TOTP(secret).verify(totp_code.strip(), valid_window=TOTP_VALID_WINDOW)
    except Exception:
        return False


def consume_backup_code(stored: list[str], submitted: str) -> tuple[bool, list[str]]:
    """Look up ``submitted`` in ``stored`` case-insensitively and remove it.

    Returns ``(matched, remaining)`` where ``remaining`` is the new list to
    persist when matched (with the used code dropped).
    """
    if not submitted:
        return False, stored
    needle = submitted.strip().upper()
    remaining = []
    matched = False
    for code in stored or []:
        if not matched and code.strip().upper() == needle:
            matched = True
            continue
        remaining.append(code)
    return matched, remaining

logger = logging.getLogger(__name__)


class AuthService:
    """High-level helpers around password & session logic.

    The business logic for the heavier OAuth / 2FA flows is split into separate
    service classes; this one wires the synchronous bits used by `/auth/login`,
    `/auth/register`, `/auth/refresh`, `/auth/logout`.
    """

    def __init__(
        self,
        session: AsyncSession,
        producer: KafkaProducer | StubProducer | None = None,
    ) -> None:
        self.s = session
        self.users = UserRepository(session)
        self.tenants = TenantRepository(session)
        self.sessions = SessionRepository(session)
        self.two_factor = TwoFactorRepository(session)
        self.producer = producer or StubProducer()

    # -- registration ----------------------------------------------------- #
    async def register(
        self,
        *,
        email: str,
        password: str,
        display_name: str,
        tenant_slug: str,
        locale: str = "ru",
    ) -> User:
        tenant = await self.tenants.get_by_slug(tenant_slug)
        if tenant is None:
            raise ProblemException(
                status=404,
                code="NOT_FOUND",
                title="Tenant not found",
                detail=f"No tenant with slug '{tenant_slug}'.",
            )
        existing = await self.users.get_by_email(tenant.id, email)
        if existing is not None:
            raise ProblemException(
                status=409,
                code="CONFLICT",
                title="Email already registered",
            )
        user = User(
            id=user_id(),
            tenant_id=tenant.id,
            email=email.lower(),
            password_hash=hash_password(password),
            display_name=display_name,
            locale=locale,
            global_role="student",
        )
        await self.users.add(user)
        await self._emit_user_event(
            "identity.user.registered.v1",
            user=user,
            data={"user_id": user.id, "tenant_id": user.tenant_id, "email": user.email},
        )
        # TODO: enqueue email-verify token + send email
        return user

    # -- login ------------------------------------------------------------ #
    async def login(
        self,
        *,
        email: str,
        password: str,
        tenant_slug: str | None,
        totp_code: str | None = None,
        ip: str | None = None,
        user_agent: str | None = None,
        redis: Any = None,
    ) -> tuple[User, str | None, str | None, int, str | None]:
        """Return ``(user, access_token, refresh_token, access_ttl_seconds)``.

        ``tenant_slug`` is optional. When omitted the service auto-resolves the
        tenant by email — this works as long as the email is unique across
        tenants. If multiple active accounts share the same email the response
        is still UNAUTHENTICATED to avoid leaking which tenants the user
        exists in; the caller can re-submit with an explicit tenant_slug.
        """
        user: User | None = None
        if tenant_slug:
            tenant = await self.tenants.get_by_slug(tenant_slug)
            if tenant is None:
                raise ProblemException(
                    status=401,
                    code="UNAUTHENTICATED",
                    title="Invalid credentials",
                )
            user = await self.users.get_by_email(tenant.id, email)
        else:
            # Auto-resolve: email is unique in 99 % of deployments. If we find
            # exactly one active match we proceed; otherwise we treat the
            # request as a bad credential to avoid disclosing tenant lists.
            user = await self.users.find_unique_active_by_email(email)

        if user is None or user.status != "active":
            raise ProblemException(
                status=401,
                code="UNAUTHENTICATED",
                title="Invalid credentials",
            )
        if not verify_password(password, user.password_hash):
            raise ProblemException(
                status=401,
                code="UNAUTHENTICATED",
                title="Invalid credentials",
            )

        # 2FA: either issue a one-shot mfa_token (when no code) or validate the
        # supplied TOTP. The mfa_token path returns early with a placeholder
        # 4-tuple (caller renders a 2FA-challenge response); the TOTP path
        # falls through to the normal access+refresh issuance below.
        two_fa = await self.two_factor.get(user.id)
        if two_fa is not None and two_fa.enabled_at is not None:
            if not totp_code:
                if redis is None:
                    # Redis is down; without it we cannot maintain the mfa_token
                    # state, so we fall back to the legacy "send a code with the
                    # creds" contract that the integration tests still cover.
                    raise ProblemException(
                        status=401,
                        code="TWO_FACTOR_REQUIRED",
                        title="2FA required",
                        detail="Provide TOTP code to complete login.",
                    )
                mfa_token = pysecrets.token_urlsafe(24)
                try:
                    await redis.set(
                        mfa_redis_key(mfa_token),
                        f"{user.id}|{user.tenant_id}",
                        ex=MFA_TOKEN_TTL_SECONDS,
                    )
                except Exception as exc:  # pragma: no cover - redis hiccup
                    logger.warning("Failed to persist mfa_token: %s", exc)
                    raise ProblemException(
                        status=503,
                        code="UPSTREAM_UNAVAILABLE",
                        title="2FA challenge unavailable",
                    ) from exc
                # Return the challenge — the caller renders a 2FA-required
                # response and does NOT set the refresh cookie.
                return user, None, None, MFA_TOKEN_TTL_SECONDS, mfa_token
            if not verify_totp(two_fa.secret_encrypted, totp_code):
                raise ProblemException(
                    status=401,
                    code="UNAUTHENTICATED",
                    title="Invalid TOTP code",
                )

        # Issue tokens & session
        refresh = new_refresh_token()
        sess = DBSession(
            id=session_id(),
            user_id=user.id,
            refresh_token_hash=hash_token(refresh),
            ip=ip,
            user_agent=user_agent,
            expires_at=datetime.now(timezone.utc)
            + timedelta(seconds=settings.refresh_ttl_seconds),
        )
        await self.sessions.add(sess)
        access = issue_access_token(
            user_id=user.id,
            tenant_id=user.tenant_id,
            global_role=user.global_role,
        )
        user.last_login_at = datetime.now(timezone.utc)
        await self._emit_user_event(
            "identity.session.created.v1",
            user=user,
            data={"user_id": user.id, "session_id": sess.id, "ip": ip},
        )
        return user, access, refresh, settings.jwt_access_ttl_seconds, None

    # -- 2FA challenge exchange ----------------------------------------- #
    async def complete_mfa_login(
        self,
        *,
        mfa_token: str,
        totp_code: str | None,
        backup_code: str | None,
        redis: Any,
        ip: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[User, str, str, int]:
        """Exchange a one-shot ``mfa_token`` for an access + refresh pair.

        Either ``totp_code`` (preferred) or ``backup_code`` must be supplied.
        On success the mfa_token is single-use — we delete it from Redis before
        returning. Backup codes are also single-use and are removed from the
        user's stored list.
        """
        if redis is None:
            raise ProblemException(
                status=503,
                code="UPSTREAM_UNAVAILABLE",
                title="2FA challenge state unavailable",
            )
        if not mfa_token or (not totp_code and not backup_code):
            raise ProblemException(
                status=400,
                code="BAD_REQUEST",
                title="mfa_token and one of totp_code/backup_code required",
            )
        key = mfa_redis_key(mfa_token)
        try:
            raw = await redis.get(key)
        except Exception as exc:  # pragma: no cover - redis hiccup
            logger.warning("Failed to read mfa_token: %s", exc)
            raise ProblemException(
                status=503, code="UPSTREAM_UNAVAILABLE", title="2FA state unavailable"
            ) from exc
        if not raw:
            raise ProblemException(
                status=401,
                code="UNAUTHENTICATED",
                title="Invalid or expired mfa_token",
            )
        # Stored as "<user_id>|<tenant_id>" — split lazily.
        value = raw.decode("utf-8") if isinstance(raw, bytes) else str(raw)
        try:
            user_id_, _tenant_id = value.split("|", 1)
        except ValueError:
            user_id_, _tenant_id = value, ""

        user = await self.users.get(user_id_)
        if user is None or user.status != "active":
            await redis.delete(key)
            raise ProblemException(
                status=401, code="UNAUTHENTICATED", title="User unavailable"
            )

        two_fa = await self.two_factor.get(user.id)
        if two_fa is None or two_fa.enabled_at is None:
            await redis.delete(key)
            raise ProblemException(
                status=400, code="BAD_REQUEST", title="2FA is not enabled"
            )

        if totp_code:
            if not verify_totp(two_fa.secret_encrypted, totp_code):
                # Don't delete the mfa_token: client gets one more attempt
                # within the TTL window.
                raise ProblemException(
                    status=401, code="UNAUTHENTICATED", title="Invalid TOTP code"
                )
        else:
            matched, remaining = consume_backup_code(
                two_fa.backup_codes or [], backup_code or ""
            )
            if not matched:
                raise ProblemException(
                    status=401, code="UNAUTHENTICATED", title="Invalid backup code"
                )
            two_fa.backup_codes = remaining
            await self.two_factor.upsert(two_fa)

        # Single-use: delete the challenge before issuing tokens.
        try:
            await redis.delete(key)
        except Exception:  # pragma: no cover - best-effort
            pass

        refresh = new_refresh_token()
        sess = DBSession(
            id=session_id(),
            user_id=user.id,
            refresh_token_hash=hash_token(refresh),
            ip=ip,
            user_agent=user_agent,
            expires_at=datetime.now(timezone.utc)
            + timedelta(seconds=settings.refresh_ttl_seconds),
        )
        await self.sessions.add(sess)
        access = issue_access_token(
            user_id=user.id,
            tenant_id=user.tenant_id,
            global_role=user.global_role,
        )
        user.last_login_at = datetime.now(timezone.utc)
        await self._emit_user_event(
            "identity.session.created.v1",
            user=user,
            data={
                "user_id": user.id,
                "session_id": sess.id,
                "ip": ip,
                "mfa": "totp" if totp_code else "backup_code",
            },
        )
        return user, access, refresh, settings.jwt_access_ttl_seconds

    # -- refresh ---------------------------------------------------------- #
    async def refresh(self, *, refresh_token: str) -> tuple[str, str, int]:
        """Rotate refresh token; return ``(access, new_refresh, access_ttl)``."""
        sess = await self.sessions.get_by_token_hash(hash_token(refresh_token))
        if sess is None or sess.revoked_at is not None:
            raise ProblemException(
                status=401,
                code="TOKEN_REVOKED",
                title="Refresh token invalid",
            )
        if sess.expires_at <= datetime.now(timezone.utc).replace(tzinfo=sess.expires_at.tzinfo):
            raise ProblemException(
                status=401,
                code="TOKEN_EXPIRED",
                title="Refresh token expired",
            )
        user = await self.users.get(sess.user_id)
        if user is None or user.status != "active":
            raise ProblemException(
                status=401,
                code="UNAUTHENTICATED",
                title="User unavailable",
            )
        # Rotate
        new_refresh = new_refresh_token()
        sess.refresh_token_hash = hash_token(new_refresh)
        sess.last_used_at = datetime.now(timezone.utc)
        access = issue_access_token(
            user_id=user.id,
            tenant_id=user.tenant_id,
            global_role=user.global_role,
        )
        return access, new_refresh, settings.jwt_access_ttl_seconds

    # -- logout ----------------------------------------------------------- #
    async def logout(self, *, refresh_token: str | None) -> None:
        if not refresh_token:
            return
        sess = await self.sessions.get_by_token_hash(hash_token(refresh_token))
        if sess is None:
            return
        await self.sessions.revoke(sess.id)
        await self._emit_user_event(
            "identity.session.revoked.v1",
            user=None,
            data={"session_id": sess.id, "user_id": sess.user_id},
            tenant_id_override=None,
        )

    # -- helpers --------------------------------------------------------- #
    async def _emit_user_event(
        self,
        event_type: str,
        *,
        user: User | None,
        data: dict[str, Any],
        tenant_id_override: str | None = None,
    ) -> None:
        try:
            event = make_event(
                event_type,
                data=data,
                tenant_id=(user.tenant_id if user else tenant_id_override),
                subject=f"users/{user.id}" if user else None,
            )
            await self.producer.publish(settings.kafka_topic_user, event)
        except Exception as exc:  # pragma: no cover - producer is best-effort
            logger.warning("Failed to publish %s: %s", event_type, exc)
