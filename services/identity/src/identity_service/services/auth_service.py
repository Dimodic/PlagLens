"""Auth orchestration: register, login, refresh, MFA, password flows."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ..common.events import KafkaProducer, StubProducer, make_event
from ..common.ids import gen_id, session_id, user_id
from ..common.problem import ProblemException
from ..common.security import (
    decode_access_token,
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
    ) -> tuple[User, str, str, int]:
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

        # 2FA
        two_fa = await self.two_factor.get(user.id)
        if two_fa is not None and two_fa.enabled_at is not None:
            if not totp_code:
                raise ProblemException(
                    status=401,
                    code="TWO_FACTOR_REQUIRED",
                    title="2FA required",
                    detail="Provide TOTP code to complete login.",
                )
            # TODO: validate totp_code via pyotp; raise UNAUTHENTICATED on failure.

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

    @staticmethod
    def decode_access(token: str) -> dict[str, Any]:
        return decode_access_token(token)

    @staticmethod
    def operation_id() -> str:
        return gen_id("op")
