"""Pytest fixtures for PlagLens end-to-end tests.

Configuration via environment variables:

    PLAGLENS_GATEWAY_URL  — base URL of the gateway (default http://localhost:8080)
    PLAGLENS_TEST_TENANT  — tenant slug to use (default e2e-tenant)
    PLAGLENS_TEST_EMAIL   — test user email (default e2e@plaglens.local)
    PLAGLENS_TEST_PWD     — test user password (default e2e-Pa55w0rd!)

The fixtures attempt to bootstrap a tenant + admin user via the public
auth endpoints; if those endpoints aren't reachable the JWT fixture falls
back to a locally-signed dev token (handy for fully-mocked runs against
a service that uses the same dev keypair as in `infra/.env.example`).
"""

from __future__ import annotations

import os
import time
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass

import httpx
import pytest
import pytest_asyncio


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class E2EConfig:
    gateway_url: str
    tenant_slug: str
    email: str
    password: str
    request_timeout: float = 10.0

    @classmethod
    def from_env(cls) -> E2EConfig:
        return cls(
            gateway_url=os.getenv("PLAGLENS_GATEWAY_URL", "http://localhost:8080").rstrip("/"),
            tenant_slug=os.getenv("PLAGLENS_TEST_TENANT", "e2e-tenant"),
            email=os.getenv("PLAGLENS_TEST_EMAIL", f"e2e+{uuid.uuid4().hex[:8]}@plaglens.local"),
            password=os.getenv("PLAGLENS_TEST_PWD", "e2e-Pa55w0rd!"),
            request_timeout=float(os.getenv("PLAGLENS_TEST_TIMEOUT", "10")),
        )


@pytest.fixture(scope="session")
def e2e_config() -> E2EConfig:
    return E2EConfig.from_env()


@pytest.fixture(scope="session")
def gateway_url(e2e_config: E2EConfig) -> str:
    return e2e_config.gateway_url


# ---------------------------------------------------------------------------
# Liveness probe — skips the entire suite if the gateway is unreachable
# ---------------------------------------------------------------------------
@pytest.fixture(scope="session", autouse=True)
def _gateway_reachable(e2e_config: E2EConfig) -> None:
    deadline = time.monotonic() + 2.0
    last_exc: Exception | None = None
    while time.monotonic() < deadline:
        try:
            r = httpx.get(f"{e2e_config.gateway_url}/healthz", timeout=1.0)
            if r.status_code < 500:
                return
        except httpx.HTTPError as e:
            last_exc = e
        except OSError as e:
            last_exc = e
        time.sleep(0.25)
    pytest.skip(f"Gateway not reachable at {e2e_config.gateway_url}: {last_exc}")


# ---------------------------------------------------------------------------
# Async HTTP client
# ---------------------------------------------------------------------------
@pytest_asyncio.fixture(scope="function")
async def http_client(e2e_config: E2EConfig) -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(
        base_url=e2e_config.gateway_url,
        timeout=e2e_config.request_timeout,
        follow_redirects=False,
    ) as client:
        yield client


# ---------------------------------------------------------------------------
# JWT bootstrap — tries register/login, falls back to dev-signed token
# ---------------------------------------------------------------------------
async def _try_register_and_login(client: httpx.AsyncClient, cfg: E2EConfig) -> str | None:
    """Best-effort: returns access token or None if bootstrap impossible."""
    # 1) Try to ensure the tenant exists.  Most envs don't expose this
    # publicly; a 404/401 here is fine — we just continue to register.
    try:
        await client.post(
            "/api/v1/tenants",
            json={"slug": cfg.tenant_slug, "name": "E2E Tenant"},
            headers={"X-Tenant-Hint": cfg.tenant_slug},
        )
    except httpx.HTTPError:
        pass

    # 2) Register (idempotent in spirit — we accept 409 as "already exists").
    try:
        reg = await client.post(
            "/api/v1/auth/register",
            json={
                "email": cfg.email,
                "password": cfg.password,
                "tenant_slug": cfg.tenant_slug,
                "full_name": "E2E Bot",
            },
            headers={"X-Tenant-Hint": cfg.tenant_slug},
        )
        if reg.status_code not in (200, 201, 202, 409):
            return None
    except httpx.HTTPError:
        return None

    # 3) Login.
    try:
        log = await client.post(
            "/api/v1/auth/login",
            json={
                "email": cfg.email,
                "password": cfg.password,
                "tenant_slug": cfg.tenant_slug,
            },
            headers={"X-Tenant-Hint": cfg.tenant_slug},
        )
    except httpx.HTTPError:
        return None
    if log.status_code != 200:
        return None
    body = log.json()
    return body.get("access_token") or body.get("token") or body.get("data", {}).get("access_token")


def _dev_signed_jwt(cfg: E2EConfig) -> str:
    """Locally signed JWT for environments using the dev keypair from
    infra/.env.example.  ONLY valid against services running with the same
    dev secret — never against production.
    """
    try:
        import jwt  # type: ignore
    except ImportError:
        pytest.skip("PyJWT not installed and gateway auth bootstrap failed")

    secret = os.getenv("PLAGLENS_DEV_JWT_SECRET", "dev-secret-do-not-use-in-prod")
    payload = {
        "sub": "e2e-user",
        "tenant_id": cfg.tenant_slug,
        "roles": ["admin"],
        "course_roles": [],
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600,
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, secret, algorithm="HS256")


@pytest_asyncio.fixture(scope="session")
async def jwt_token(e2e_config: E2EConfig) -> str:
    async with httpx.AsyncClient(
        base_url=e2e_config.gateway_url,
        timeout=e2e_config.request_timeout,
    ) as client:
        token = await _try_register_and_login(client, e2e_config)
    if token:
        return token
    # Fallback: dev-signed token for fully-mocked / single-service smoke runs.
    return _dev_signed_jwt(e2e_config)


@pytest.fixture(scope="session")
def auth_headers(jwt_token: str, e2e_config: E2EConfig) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {jwt_token}",
        "X-Tenant-Hint": e2e_config.tenant_slug,
        "Content-Type": "application/json",
    }


# ---------------------------------------------------------------------------
# Service catalogue used by smoke tests
# ---------------------------------------------------------------------------
SERVICE_NAMES: tuple[str, ...] = (
    "gateway",
    "identity",
    "course",
    "submission",
    "integration",
    "plagiarism",
    "ai-analysis",
    "notification",
    "reporting",
    "audit",
)


@pytest.fixture(scope="session")
def service_names() -> tuple[str, ...]:
    return SERVICE_NAMES
