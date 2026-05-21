"""Application settings."""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    SERVICE_NAME: str = "notification-service"
    VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    DATABASE_URL: str = "postgresql+asyncpg://plaglens:plaglens@localhost:5432/notification"
    DATABASE_SCHEMA: str = "notification"

    REDIS_URL: str = "redis://localhost:6379/0"

    KAFKA_BROKERS: str = "localhost:9092"
    KAFKA_CONSUMER_GROUP: str = "notification-service"
    KAFKA_PUBLISH_PREFIX: str = "plaglens"

    # Topics this service consumes (multi-source fan-in).
    KAFKA_TOPICS: tuple[str, ...] = (
        "plaglens.identity.user.v1",
        "plaglens.course.course.v1",
        "plaglens.course.assignment.v1",
        "plaglens.submission.submission.v1",
        "plaglens.submission.grade.v1",
        "plaglens.integration.import.v1",
        "plaglens.plagiarism.run.v1",
        "plaglens.ai.analysis.v1",
        "plaglens.ai.budget.v1",
        "plaglens.reporting.export.v1",
    )

    JWT_PUBLIC_KEY_PATH: str | None = None
    JWT_PUBLIC_KEY: str | None = None
    JWT_ALGORITHM: str = "RS256"
    JWT_AUDIENCE: str = "plaglens"

    # ---------- Email transport selection ----------
    # `smtp` (default for dev: Mailhog) | `mailgun` (HTTP API for prod).
    EMAIL_TRANSPORT: str = "smtp"

    # SMTP (development → Mailhog at mailhog:1025; production → Mailgun SMTP creds)
    SMTP_HOST: str = "mailhog"
    SMTP_PORT: int = 1025
    SMTP_USE_TLS: bool = False
    SMTP_USE_STARTTLS: bool = False
    SMTP_USERNAME: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_TIMEOUT_SECONDS: float = 10.0

    # Mailgun (HTTP API, production fallback)
    MAILGUN_DOMAIN: str = "mg.example.com"
    MAILGUN_API_KEY_PATH: str | None = None
    MAILGUN_API_KEY: str | None = None
    MAILGUN_BASE_URL: str = "https://api.mailgun.net/v3"
    MAILGUN_TIMEOUT_SECONDS: float = 10.0
    MAILGUN_WEBHOOK_SIGNING_KEY: str | None = None

    # Default From / Reply-To (also stored in EmailTransportConfig DB row).
    FROM_EMAIL: str = "noreply@plaglens.local"
    EMAIL_FROM: str | None = None  # alias env var name from .env.example
    FROM_NAME: str = "PlagLens"
    EMAIL_FROM_NAME: str | None = None
    REPLY_TO: str | None = None
    EMAIL_REPLY_TO: str | None = None

    # Bounce policy: how many hard bounces before disabling email for a user.
    EMAIL_HARD_BOUNCES_THRESHOLD: int = 3

    # Shared secret for the internal email-direct endpoint (Identity ↔ Notification).
    NOTIFICATION_INTERNAL_TOKEN: str | None = None

    TELEGRAM_BOT_TOKEN_PATH: str | None = None
    TELEGRAM_BOT_TOKEN: str | None = None
    TELEGRAM_BOT_USERNAME: str | None = None

    SSE_HEARTBEAT_SECONDS: float = 25.0
    SSE_REDIS_CHANNEL_PREFIX: str = "sse:user:"

    DIGEST_HOURLY_INTERVAL_SECONDS: int = 3600
    DIGEST_DAILY_INTERVAL_SECONDS: int = 86400

    DEFAULT_LOCALE: str = "ru"
    SUPPORTED_LOCALES: tuple[str, ...] = ("ru", "en")

    QUIET_HOURS_QUEUE_KEY: str = "notification:quiet:zset"

    EMAIL_RATE_LIMIT_PER_MIN: int = 1

    AUTH_DISABLED: bool = Field(default=False, description="Disable JWT for local/test runs")
    KAFKA_DISABLED: bool = Field(default=False, description="Disable Kafka for local/test runs")
    REDIS_DISABLED: bool = Field(default=False, description="Use in-memory pubsub stub")
    SCHEDULER_DISABLED: bool = Field(default=False)
    TELEGRAM_DISABLED: bool = Field(default=True, description="Disable real Telegram calls")

    IDEMPOTENCY_TTL_SECONDS: int = 24 * 3600


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    # Allow .env-style aliases EMAIL_FROM / EMAIL_FROM_NAME / EMAIL_REPLY_TO
    # to override FROM_EMAIL / FROM_NAME / REPLY_TO when they are set.
    if s.EMAIL_FROM:
        s.FROM_EMAIL = s.EMAIL_FROM
    if s.EMAIL_FROM_NAME:
        s.FROM_NAME = s.EMAIL_FROM_NAME
    if s.EMAIL_REPLY_TO and not s.REPLY_TO:
        s.REPLY_TO = s.EMAIL_REPLY_TO
    return s


def reset_settings_cache() -> None:
    get_settings.cache_clear()
