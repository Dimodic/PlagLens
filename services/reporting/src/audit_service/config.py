"""Audit Service configuration (env-driven)."""
from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    service_name: str = "audit-service"
    version: str = "0.1.0"
    environment: Literal["local", "test", "staging", "prod"] = "local"
    log_level: str = "INFO"

    # Postgres (async DSN; tests can swap to sqlite+aiosqlite).
    database_url: str = (
        "postgresql+asyncpg://audit:audit@localhost:5432/audit"
    )
    database_schema: str = "audit"

    # Redis (idempotency / rate-limit / cache).
    redis_url: str = "redis://localhost:6379/3"

    # Kafka — Audit consumes ALL plaglens.* topics.
    kafka_brokers: str = "localhost:9092"
    kafka_topic_pattern: str = "^plaglens\\..*"
    kafka_group_id: str = "audit-service"

    # JWT verification (verify mode — public key only).
    jwt_public_key_path: str = "keys/jwt-public.pem"
    jwt_public_key: str | None = None
    jwt_alg: str = "RS256"
    jwt_audience: str = "plaglens"
    jwt_issuer: str = "plaglens-identity"

    # Internal service-to-service token.
    internal_service_token: str = "dev-internal-token"

    # Retention.
    retention_default_days: int = 365
    retention_long_days: int = 2555  # 7 years

    # Reporting (export proxy).
    reporting_base_url: str = "http://reporting:8080"

    # Background jobs toggles (disable in tests).
    run_background_jobs: bool = True
    auth_disabled: bool = False
    kafka_disabled: bool = False
    redis_disabled: bool = False
    scheduler_disabled: bool = False

    # Retention cleaner cadence.
    retention_cron_hour: int = 3  # 03:00 daily
    partition_cron_day: int = 25  # day of month to ensure next-month partition

    @property
    def kafka_brokers_list(self) -> list[str]:
        return [b.strip() for b in self.kafka_brokers.split(",") if b.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


def reset_settings_cache() -> None:
    get_settings.cache_clear()


settings = get_settings()
