"""Service configuration via pydantic-settings (env-driven)."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- App ----
    service_name: str = "identity-service"
    environment: Literal["local", "test", "staging", "prod"] = "local"
    log_level: str = "INFO"
    identity_base_url: str = "http://localhost:8080"

    # ---- Postgres (async DSN; tests can override with sqlite+aiosqlite) ----
    database_url: str = (
        "postgresql+asyncpg://identity:identity@localhost:5432/identity"
    )

    # ---- Redis ----
    redis_url: str = "redis://localhost:6379/0"

    # ---- Kafka ----
    kafka_brokers: str = "localhost:9092"
    kafka_topic_user: str = "plaglens.identity.user.v1"
    kafka_topic_tenant: str = "plaglens.identity.tenant.v1"
    # Session lifecycle events (session.created/revoked) ride the user topic —
    # there is no dedicated session topic. They are consumed by Audit (which
    # subscribes by pattern), so a separate topic would add no value.

    # ---- JWT ----
    jwt_private_key_path: str = "keys/jwt-private.pem"
    jwt_public_key_path: str = "keys/jwt-public.pem"
    jwt_kid: str = "kid-1"
    jwt_issuer: str = "plaglens-identity"
    jwt_audience: str = "plaglens"
    jwt_alg: str = "RS256"
    jwt_access_ttl_seconds: int = 900
    refresh_ttl_seconds: int = 30 * 24 * 3600

    # Service-to-service auth — shared secret used by internal services
    # (integration, scheduler, …) to obtain long-lived super_admin JWTs from
    # `POST /v1/auth/service-token`. Rotate in production; the resulting
    # token has a long TTL (24h) so background workers don't have to refresh
    # mid-cycle. Rotate the secret to invalidate every token at once.
    service_auth_secret: str = "service-auth-shared-secret-change-me"
    service_token_ttl_seconds: int = 24 * 3600

    # ---- Argon2id ----
    argon2_time_cost: int = 3
    argon2_memory_kib: int = 65536
    argon2_parallelism: int = 2
    argon2_hash_len: int = 32

    # ---- 2FA ----
    totp_fernet_key: str = ""  # base64 32-byte; auto-generated in dev
    totp_issuer: str = "PlagLens"

    # ---- OAuth (4 providers) ----
    oauth_providers_enabled: list[str] = Field(
        default_factory=lambda: ["google", "yandex", "stepik", "github"]
    )
    oauth_callback_base_url: str = "http://localhost:8000"
    oauth_state_ttl_seconds: int = 600

    google_client_id: str | None = None
    google_client_secret: str | None = None
    yandex_client_id: str | None = None
    yandex_client_secret: str | None = None
    stepik_client_id: str | None = None
    stepik_client_secret: str | None = None
    github_client_id: str | None = None
    github_client_secret: str | None = None

    # Legacy aliases (read from env if present so older deployments keep working).
    oauth_google_client_id: str = ""
    oauth_google_client_secret: str = ""
    oauth_yandex_client_id: str = ""
    oauth_yandex_client_secret: str = ""
    oauth_stepik_client_id: str = ""
    oauth_stepik_client_secret: str = ""
    oauth_github_client_id: str = ""
    oauth_github_client_secret: str = ""

    @field_validator("oauth_providers_enabled", mode="before")
    @classmethod
    def _split_providers(cls, v: object) -> object:
        if isinstance(v, str):
            return [item.strip() for item in v.split(",") if item.strip()]
        return v

    # ---- Email transport ----
    # Identity does NOT own the delivery layer — it forwards transactional
    # emails (verify / password-reset / invitation / email-change) to the
    # notification service via its internal HTTP endpoint
    # (``POST /api/v1/internal/notifications/email-direct``). Authentication
    # is a shared bearer token; when empty, AUTH_DISABLED on the notification
    # side lets us skip it in local/test runs.
    notification_base_url: str = "http://reporting:8000"
    notification_internal_token: str = ""

    # Public-facing base URL of the frontend SPA. Used to build absolute
    # callback links inside transactional emails (verify, password-reset,
    # invitation, email-change). When empty, email-service falls back to a
    # relative path so the user can prepend the host themselves.
    frontend_base_url: str = ""

    # From-name shown in the From header of every transactional email.
    mailgun_from: str = "no-reply@plaglens.local"

    # ---- Avatars (MinIO / S3) ----
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = ""
    minio_secret_key: str = ""
    minio_secure: bool = False
    minio_region: str = "us-east-1"
    avatars_bucket: str = "plaglens-avatars"
    avatars_url_ttl_seconds: int = 7 * 24 * 3600
    avatar_max_size_bytes: int = 2 * 1024 * 1024  # 2 MiB

    # ---- Idempotency ----
    idempotency_ttl_seconds: int = 24 * 3600

    # ---- Cookies ----
    # NOTE: ``__Host-`` requires the ``Secure`` flag (HTTPS), so for plain
    # ``dev`` we fall back to a non-prefixed name. Override via env when
    # deploying staging/prod over TLS.
    refresh_cookie_name: str = "plaglens_refresh"

    # ---- Rate-limit windows (informational; gateway enforces) ----
    rate_limit_login_per_minute: int = 5

    # ---- Misc ----
    default_locale: str = "ru"

    @property
    def cookie_secure(self) -> bool:
        return self.environment in ("staging", "prod")

    @property
    def kafka_brokers_list(self) -> list[str]:
        return [b.strip() for b in self.kafka_brokers.split(",") if b.strip()]

    def oauth_credentials(self, provider: str) -> tuple[str, str]:
        """Return ``(client_id, client_secret)`` for the given provider.

        Resolution order:

        1. Admin-edited override held in the in-process cache
           (``oauth.overrides``) — populated from the
           ``oauth_provider_overrides`` table at startup and on PATCH.
        2. Modern ``GOOGLE_CLIENT_ID``-style env vars.
        3. Legacy ``OAUTH_GOOGLE_CLIENT_ID``-style env vars.

        Returns ``("", "")`` when nothing is set.
        """
        # Local import to avoid a circular dependency at module import time
        # (overrides → models → Base; settings is imported early).
        from .oauth import overrides as _overrides

        override = _overrides.get_override(provider)
        if override is not None:
            return override
        modern_cid = getattr(self, f"{provider}_client_id", None)
        modern_csec = getattr(self, f"{provider}_client_secret", None)
        legacy_cid = getattr(self, f"oauth_{provider}_client_id", "")
        legacy_csec = getattr(self, f"oauth_{provider}_client_secret", "")
        cid = (modern_cid or legacy_cid or "")
        csec = (modern_csec or legacy_csec or "")
        return cid, csec

    def oauth_provider_configured(self, provider: str) -> bool:
        cid, csec = self.oauth_credentials(provider)
        return bool(cid and csec)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
