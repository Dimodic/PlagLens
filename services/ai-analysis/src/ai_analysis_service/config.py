"""Application settings for AI Analysis Service."""
from __future__ import annotations

import os
from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    SERVICE_NAME: str = "ai-analysis-service"
    VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"

    DATABASE_URL: str = "postgresql+asyncpg://plaglens:plaglens@localhost:5432/ai_analysis"
    DATABASE_SCHEMA: str = "ai_analysis"

    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_KEY_PREFIX: str = "ai"
    CACHE_TTL_SECONDS: int = 30 * 24 * 3600

    KAFKA_BROKERS: str = "localhost:9092"
    KAFKA_CONSUMER_GROUP: str = "ai-analysis-service"
    KAFKA_PUBLISH_PREFIX: str = "plaglens"

    JWT_PUBLIC_KEY_PATH: str | None = None
    JWT_PUBLIC_KEY: str | None = None
    JWT_ALGORITHM: str = "RS256"
    JWT_AUDIENCE: str = "plaglens"

    # Shared service-to-service secret (same value across services). Guards
    # internal endpoints called off-request, e.g. reporting's grade-export
    # column matcher (/api/v1/internal/match-columns).
    SERVICE_AUTH_SECRET: str = "service-auth-shared-secret-change-me"

    # ----------------------- LLM defaults ---------------------------------
    # Settings precedence per spec:
    #   1) ProviderConfig row (per-tenant; admin-managed via /admin/ai/providers).
    #   2) These defaults — used by the bootstrap fallback when no rows exist.
    LLM_DEFAULT_PROVIDER_NAME: str = "openrouter"
    LLM_DEFAULT_BASE_URL: str = "https://openrouter.ai/api/v1"
    LLM_DEFAULT_MODEL: str = "openai/gpt-4o-mini"

    # OpenRouter-specific app attribution headers (HTTP-Referer / X-Title).
    OPENROUTER_HTTP_REFERER: str = "https://plaglens.local"
    OPENROUTER_X_TITLE: str = "PlagLens"

    # Default analysis temperature (low for code-review determinism).
    LLM_DEFAULT_TEMPERATURE: float = 0.2

    # ----------------------- Backwards-compat aliases ---------------------
    # Older code paths consult DEFAULT_PROVIDER / DEFAULT_MODEL / DEFAULT_BASE_URL.
    # Keep them in sync with LLM_DEFAULT_* via property fallthrough below.
    DEFAULT_PROVIDER: str | None = None
    DEFAULT_MODEL: str | None = None
    DEFAULT_BASE_URL: str | None = None

    # ----------------------- Provider API keys (env or Vault) -------------
    # Never persisted in DB. ProviderConfig.api_key_env_var carries the env
    # var *name*; the value lives in env (per-deploy override) or Vault (shared
    # source of truth). resolve_api_key() reads it at request time.
    OPENROUTER_API_KEY: str | None = None
    OPENAI_API_KEY: str | None = None
    OPENAI_API_KEY_PATH: str | None = None
    ANTHROPIC_API_KEY: str | None = None
    YANDEX_GPT_API_KEY: str | None = None
    GIGACHAT_AUTH_KEY: str | None = None

    # Vault KV v2 path (under secret/plaglens/) holding the default LLM key.
    VAULT_LLM_SECRET_PATH: str = "llm/openai"

    DEFAULT_PROMPT_VERSION: str = "v1"

    MAX_PROMPT_TOKENS: int = 8000
    MAX_COMPLETION_TOKENS: int = 2000

    LLM_TIMEOUT_S: int = 60
    FAILOVER_THRESHOLD: int = 3
    BUDGET_WARN_COOLDOWN_S: int = 6 * 3600
    BUDGET_ROLLOVER_INTERVAL_S: int = 300

    # Retry policy on 429 / 5xx (per spec: 1s, 2s, 5s — honoring Retry-After).
    LLM_RETRY_BACKOFFS: str = "1.0,2.0,5.0"

    # docker-compose wires the submission service as ``SUBMISSION_BASE_URL``;
    # accept that name too so the URL isn't silently left at the wrong
    # default (``extra="ignore"`` would otherwise drop the env var).
    SUBMISSION_SERVICE_URL: str = Field(
        default="http://submission:8000",
        validation_alias=AliasChoices(
            "SUBMISSION_SERVICE_URL", "SUBMISSION_BASE_URL"
        ),
    )
    COURSE_SERVICE_URL: str = "http://course-service:8080"

    IDEMPOTENCY_TTL_SECONDS: int = 24 * 3600

    AUTH_DISABLED: bool = Field(default=False)
    KAFKA_DISABLED: bool = Field(default=False)

    # ------------------------- Resolved getters --------------------------

    @property
    def default_provider_resolved(self) -> str:
        return self.DEFAULT_PROVIDER or self.LLM_DEFAULT_PROVIDER_NAME

    @property
    def default_model_resolved(self) -> str:
        return self.DEFAULT_MODEL or self.LLM_DEFAULT_MODEL

    @property
    def default_base_url_resolved(self) -> str:
        return self.DEFAULT_BASE_URL or self.LLM_DEFAULT_BASE_URL

    @property
    def retry_backoffs_resolved(self) -> list[float]:
        out: list[float] = []
        for chunk in (self.LLM_RETRY_BACKOFFS or "").split(","):
            chunk = chunk.strip()
            if not chunk:
                continue
            try:
                out.append(float(chunk))
            except ValueError:
                continue
        return out or [1.0, 2.0, 5.0]

    def resolve_api_key(self, env_var: str | None = None) -> str | None:
        """Resolve an API key by precedence:

        1. ``env_var`` argument — read ``os.environ[env_var]`` if set.
        2. Provider-specific settings field (e.g. ``OPENROUTER_API_KEY``).
        3. Generic ``OPENAI_API_KEY`` (legacy default).
        4. ``OPENAI_API_KEY_PATH`` (file-based, legacy).
        5. Vault (``secret/plaglens/{VAULT_LLM_SECRET_PATH}`` key ``api_key``)
           — the shared source of truth when nothing is set in the env.
        """
        if env_var:
            value = os.environ.get(env_var)
            if value:
                return value
            # also try the same name on settings (loaded from .env)
            attr = getattr(self, env_var, None)
            if attr:
                return str(attr)
            return self._vault_llm_key()
        if self.OPENROUTER_API_KEY:
            return self.OPENROUTER_API_KEY
        if self.OPENAI_API_KEY:
            return self.OPENAI_API_KEY
        if self.OPENAI_API_KEY_PATH and os.path.isfile(self.OPENAI_API_KEY_PATH):
            with open(self.OPENAI_API_KEY_PATH, encoding="utf-8") as fh:
                return fh.read().strip()
        return self._vault_llm_key()

    def _vault_llm_key(self) -> str | None:
        """Fetch the default LLM API key from Vault (or ``None`` if Vault is
        unavailable / unset / placeholder). Import is local so the service has
        no hard dependency on a running Vault."""
        from plaglens_common.secrets import get_vault

        return get_vault().get_secret(self.VAULT_LLM_SECRET_PATH, "api_key")


@lru_cache
def get_settings() -> Settings:
    return Settings()
