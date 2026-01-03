"""Service configuration via environment variables."""
from __future__ import annotations

import os
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Reporting service settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )

    service_name: str = "reporting-service"
    env: str = "dev"
    log_level: str = "INFO"

    database_url: str = Field(
        default="sqlite+aiosqlite:///:memory:",
        description="Async SQLAlchemy DB URL",
    )
    db_schema: str = "reporting"

    redis_url: str = "redis://localhost:6379/2"
    redis_prefix: str = "reporting"

    # The shared compose env-block exports ``KAFKA_BROKERS=kafka:9092``;
    # this service originally named its field ``kafka_bootstrap`` and
    # never wired the alias, so the consumer kept trying to reach
    # ``localhost:9092`` inside the container and the read-model stayed
    # empty (every course showed 0 / 0 / 0). Accept both names.
    kafka_bootstrap: str = Field(
        default="localhost:9092",
        validation_alias="KAFKA_BROKERS",
    )
    kafka_consumer_group: str = "reporting-service"

    minio_endpoint: str = "localhost:9000"
    # The endpoint the *browser* uses to follow signed download URLs. In
    # Docker ``minio_endpoint`` is the internal hostname (``minio:9000``)
    # which the browser can't resolve — we sign URLs against this public
    # endpoint instead. Default suits the dev compose where MinIO is
    # port-forwarded to localhost:9000. Override via env in prod.
    minio_public_endpoint: str = "localhost:9000"
    minio_access_key: str = "plaglens"
    minio_secret_key: str = "plaglens"
    minio_secure: bool = False
    minio_bucket_template: str = "plaglens-{tenant}"

    # Google service-account credentials, two-track:
    #
    # • ``google_sa_json`` — the JSON content inline (set via the
    #   ``GOOGLE_SA_JSON`` env var). Convenient for local dev / tests.
    # • ``google_service_account_json_path`` — a path to the JSON file
    #   (env ``GOOGLE_SERVICE_ACCOUNT_JSON_PATH``, the docker-secrets
    #   convention). Resolved on app startup; the file is read once.
    #
    # ``resolved_google_sa_json()`` returns the effective JSON — inline
    # first, file fallback second. If both are missing the Google Sheets
    # paths refuse with a "сервисный аккаунт не настроен" error rather
    # than silently degrading to an in-memory stub.
    google_sa_json: str | None = None
    google_service_account_json_path: str | None = Field(
        default=None,
        validation_alias="GOOGLE_SERVICE_ACCOUNT_JSON_PATH",
    )

    def resolved_google_sa_json(self) -> str | None:
        if self.google_sa_json:
            return self.google_sa_json
        path = self.google_service_account_json_path
        if path and os.path.isfile(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                return content or None
            except OSError:
                return None
        return None

    jwt_audience: str = "plaglens"
    jwt_issuer: str = "plaglens-identity"
    jwt_secret: str = "test-secret-change-me"

    artifact_default_ttl_days: int = 30
    download_signed_url_ttl_seconds: int = 300

    cache_overview_ttl_seconds: int = 300
    cache_detail_ttl_seconds: int = 60

    audit_service_base_url: str = "http://audit:8000"
    integration_service_base_url: str = "http://integration:8000"
    # The grades-export builder fetches the homework's assignment list from
    # the course service and per-student grades + comments from the
    # submission service, forwarding the triggering teacher's bearer token.
    course_service_base_url: str = "http://course:8000"
    submission_service_base_url: str = "http://submission:8000"
    # Scheduled grade-export runs have no incoming request to crib a token
    # from, so the scheduler mints one ``as`` the binding's creator via
    # identity's ``/auth/service-token`` (with ``tenant_id`` + ``as_user_id``
    # body). Shared secret matches the same env across services.
    identity_service_base_url: str = "http://identity:8000"
    service_auth_secret: str = "service-auth-shared-secret-change-me"

    operation_id_prefix: str = "op_"
    export_id_prefix: str = "exp_"
    schedule_id_prefix: str = "sch_"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
