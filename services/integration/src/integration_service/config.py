"""Service configuration via env vars."""
from __future__ import annotations

from functools import lru_cache
from typing import List, Optional

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # `.env` for shared/dev defaults, `.env.local` for secrets that must
        # never be committed (it is in .gitignore via `.env.*`). When both are
        # present, `.env.local` takes precedence.
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- service basics ----
    service_name: str = "integration-service"
    environment: str = "dev"
    log_level: str = "INFO"
    api_prefix: str = "/api/v1"

    # ---- public-facing URL (frontend origin) ----
    # Used to build OAuth ``redirect_uri`` defaults that the admin sees
    # in /admin/integrations → Авторизация. Defaults to localhost so
    # ``npm run dev`` works out of the box; the deploy passes the real
    # host (e.g. https://85.192.48.223.nip.io) via FRONTEND_BASE_URL env.
    frontend_base_url: str = "http://localhost:5173"

    # ---- database ----
    database_url: str = "postgresql+asyncpg://plaglens:plaglens@localhost:5432/plaglens"
    database_echo: bool = False
    db_schema: str = "integration"

    # ---- redis ----
    redis_url: str = "redis://localhost:6379/3"
    oauth_state_ttl_seconds: int = 600  # 10 minutes
    access_token_cache_ttl_seconds: int = 3300

    # ---- kafka ----
    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_consumer_group: str = "integration-service"
    kafka_topic_assignment: str = "plaglens.course.assignment.v1"
    kafka_topic_course: str = "plaglens.course.course.v1"
    kafka_topic_tenant: str = "plaglens.identity.tenant.v1"
    kafka_topic_integration_import: str = "plaglens.integration.import.v1"
    kafka_topic_integration_config: str = "plaglens.integration.config.v1"

    # ---- Stepik OAuth ----
    stepik_oauth_client_id: Optional[str] = None
    stepik_oauth_client_secret: Optional[str] = None
    stepik_oauth_authorize_url: str = "https://stepik.org/oauth2/authorize/"
    stepik_oauth_token_url: str = "https://stepik.org/oauth2/token/"
    stepik_oauth_scope: str = "read"
    stepik_oauth_redirect_uri: str = "http://localhost:8080/api/v1/integrations/_/oauth/callback"
    stepik_api_base_url: str = "https://stepik.org/api"

    # ---- Yandex.Contest OAuth ----
    # `contest:manage` is the only scope that gives read access to participants
    # and standings (`contest:submit` is for submitting solutions and is not
    # needed for our import flow). Both are public scopes — no Yandex partnership
    # required.
    yandex_contest_oauth_client_id: Optional[str] = None
    yandex_contest_oauth_client_secret: Optional[str] = None
    yandex_contest_oauth_authorize_url: str = "https://oauth.yandex.ru/authorize"
    yandex_contest_oauth_token_url: str = "https://oauth.yandex.ru/token"
    yandex_contest_oauth_scope: str = "contest:manage"
    yandex_contest_oauth_redirect_uri: str = (
        "http://localhost:5173/integrations/oauth/callback"
    )
    yandex_contest_api_base_url: str = "https://api.contest.yandex.net/api/public/v2"

    # ---- Google ----
    google_service_account_json_path: Optional[str] = None
    google_sheets_scopes: str = "https://www.googleapis.com/auth/spreadsheets.readonly"
    # Google OAuth — used when a teacher connects their own Google account
    # via the integration flow (Iteration 2). Admin pastes client_id /
    # client_secret into the OAuth-providers admin UI (writes to
    # ``oauth_app_credentials``); these are just the public URL defaults.
    google_oauth_client_id: Optional[str] = None
    google_oauth_client_secret: Optional[str] = None
    google_oauth_authorize_url: str = "https://accounts.google.com/o/oauth2/v2/auth"
    google_oauth_token_url: str = "https://oauth2.googleapis.com/token"
    google_oauth_scope: str = "https://www.googleapis.com/auth/spreadsheets"
    google_oauth_redirect_uri: str = (
        "http://localhost:5173/integrations/oauth/callback"
    )

    # ---- Telegram ----
    telegram_bot_token: Optional[str] = None
    telegram_bot_username: Optional[str] = None
    telegram_webhook_secret: Optional[str] = None
    telegram_use_long_polling: bool = True

    # ---- webhook secrets ----
    webhook_secret_stepik: str = "stepik-shared-secret-change-me"
    webhook_secret_yandex_contest: str = "yc-shared-secret-change-me"
    webhook_secret_plagiarism: str = "plagiarism-shared-secret-change-me"
    webhook_secret_llm: str = "llm-shared-secret-change-me"

    # ---- inter-service ----
    submission_service_url: str = "http://submission:8000"
    course_service_url: str = "http://course:8000"
    identity_service_url: str = "http://identity:8000"

    # ---- service-to-service auth ----
    # Shared secret with identity-service. We exchange it for a long-lived
    # admin JWT at startup (and refresh on demand) so background workers
    # like the autosync scheduler can call other services without a real user
    # session.
    service_auth_secret: str = "service-auth-shared-secret-change-me"
    service_token_refresh_margin_seconds: int = 30 * 60  # refresh 30 min early

    # ---- limits ----
    max_concurrent_imports_per_tenant: int = 3
    max_upload_bytes: int = 256 * 1024 * 1024  # 256 MiB
    httpx_timeout_seconds: float = 30.0

    # ---- features ----
    enable_telegram_bot: bool = False
    enable_kafka: bool = False
    enable_scheduler: bool = False
    scheduler_interval_seconds: int = 300        # 5 min default
    scheduler_lock_ttl_seconds: int = 600        # 10 min — tick mustn't run longer

    # ---- CORS ----
    cors_origins: List[str] = Field(default_factory=lambda: ["http://localhost:3000"])


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
