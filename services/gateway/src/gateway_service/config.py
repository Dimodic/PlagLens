"""Gateway configuration loaded from env / yaml."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="GATEWAY_",
        env_file=".env",
        extra="ignore",
        case_sensitive=False,
    )

    # ---- General ----
    service_name: str = "gateway"
    version: str = "1.0.0"
    commit: str = "dev"
    built_at: str = "1970-01-01T00:00:00Z"
    environment: str = "dev"

    # ---- Backends (downstream service URLs) ----
    backend_identity: str = "http://identity-service:8080"
    backend_course: str = "http://course-service:8080"
    backend_submission: str = "http://submission-service:8080"
    backend_integration: str = "http://integration-service:8080"
    backend_plagiarism: str = "http://plagiarism-service:8080"
    backend_ai_analysis: str = "http://ai-analysis-service:8080"
    backend_notification: str = "http://notification-service:8080"
    backend_reporting: str = "http://reporting-service:8080"
    backend_audit: str = "http://audit-service:8080"

    # ---- JWT / JWKS ----
    jwks_url: str = "http://identity-service:8080/api/v1/.well-known/jwks.json"
    jwks_cache_ttl_s: int = 3600
    jwt_issuer: str | None = None
    jwt_audience: str | None = "plaglens"
    jwt_algorithms: tuple[str, ...] = ("RS256",)

    # ---- Redis ----
    redis_url: str = "redis://redis:6379/0"

    # ---- Rate limit ----
    rate_limit_per_ip_rpm: int = 60
    rate_limit_per_user_rpm: int = 600
    rate_limit_write_rpm: int = 120
    rate_limit_auth_rpm: int = 5
    rate_limit_run_rph: int = 30

    # ---- Body limits ----
    body_limit_default_bytes: int = 10 * 1024 * 1024  # 10 MB
    body_limit_multipart_bytes: int = 50 * 1024 * 1024  # 50 MB

    # ---- Circuit breaker ----
    cb_window_s: int = 30
    cb_open_for_s: int = 60
    cb_failure_threshold_pct: int = 50
    cb_min_calls: int = 10

    # ---- CORS defaults (per-tenant overrides via tenant.cors_origins) ----
    cors_default_origins: tuple[str, ...] = ("http://localhost:3000",)
    cors_allow_credentials: bool = True

    # ---- Proxy ----
    # 300 s headroom for long-running operations (YC bulk imports walk
    # paginated /full GETs that easily exceed 30 s on real contests).
    # Short-running endpoints aren't affected — uvicorn closes the upstream
    # response as soon as the backend finishes; the timeout is just a cap.
    proxy_timeout_s: float = 300.0
    proxy_connect_timeout_s: float = 5.0

    def backends_map(self) -> dict[str, str]:
        return {
            "identity": self.backend_identity,
            "course": self.backend_course,
            "submission": self.backend_submission,
            "integration": self.backend_integration,
            "plagiarism": self.backend_plagiarism,
            "ai-analysis": self.backend_ai_analysis,
            "notification": self.backend_notification,
            "reporting": self.backend_reporting,
            "audit": self.backend_audit,
        }


# Hop-by-hop headers that MUST be stripped on both forward & response (RFC 7230)
HOP_BY_HOP_HEADERS: frozenset[str] = frozenset(
    h.lower()
    for h in (
        "connection",
        "keep-alive",
        "proxy-authenticate",
        "proxy-authorization",
        "proxy-connection",
        "te",
        "trailer",
        "trailers",
        "transfer-encoding",
        "upgrade",
    )
)

# Public endpoint allowlist — JWT validation skipped.
PUBLIC_PATHS: frozenset[str] = frozenset(
    {
        "/healthz",
        "/readyz",
        "/metrics",
        "/api/v1/health",
        "/api/v1/version",
        "/api/v1/.well-known/jwks.json",
        "/api/v1/auth/login",
        "/api/v1/auth/register",
        "/api/v1/auth/refresh",
        "/api/v1/auth/password/forgot",
        "/api/v1/auth/password/reset",
        # Email-link confirmations — clicked while logged-out; the email token
        # travels in the body and is validated by identity, no JWT needed.
        "/api/v1/auth/email/verify/confirm",
        # Service-to-service token issuance — auth is by `X-Service-Secret`,
        # not by Bearer JWT, so the gateway must let the request reach
        # identity-service unwrapped.
        "/api/v1/auth/service-token",
        "/api/v1/_debug/client-errors",
    }
)

# Public path prefixes (regex-like simple checks).
PUBLIC_PREFIXES: tuple[str, ...] = (
    "/api/v1/auth/oauth/",
    "/api/v1/webhooks/",
    "/api/v1/.well-known/",
    # Avatar image proxy — loaded by <img src> which can't send a Bearer
    # token; avatars aren't secret. Streams bytes from the private bucket.
    "/api/v1/avatars/",
)


settings = Settings()


def get_settings() -> Settings:  # for FastAPI Depends if ever needed
    return settings


__all__ = ["Settings", "settings", "get_settings", "HOP_BY_HOP_HEADERS", "PUBLIC_PATHS", "PUBLIC_PREFIXES"]
