"""OAuth flow helpers — state in Redis (10 min TTL) + token persistence."""
from __future__ import annotations

import json
import secrets
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import urlencode

import httpx
import structlog

from integration_service.common.redis_client import get_redis
from integration_service.config import get_settings

logger = structlog.get_logger(__name__)

OAUTH_STATE_PREFIX = "oauth:state:"
OAUTH_TOKEN_PREFIX = "oauth:token:"


@dataclass
class OAuthProvider:
    name: str
    authorize_url: str
    token_url: str
    client_id: Optional[str]
    client_secret: Optional[str]
    redirect_uri: str
    scope: Optional[str] = None
    # Provider-specific extras tacked onto the authorize-URL — Google
    # needs ``access_type=offline`` + ``prompt=consent`` to actually
    # issue a refresh_token (no refresh = silent re-prompt after an hour).
    extra_params: Optional[dict[str, str]] = None


def _from_config(config: Any, key: str) -> Optional[str]:
    """Pull a value from IntegrationConfig.settings (dict). The settings field
    is the per-tenant escape hatch where teachers paste their own OAuth
    credentials via the UI. Keys we look for: client_id, client_secret,
    redirect_uri, scope."""
    if config is None:
        return None
    settings = getattr(config, "settings", None)
    if not isinstance(settings, dict):
        return None
    val = settings.get(key)
    if val in (None, ""):
        return None
    return str(val)


async def _from_db(
    kind: str, tenant_id: Optional[str]
) -> Optional[dict[str, Optional[str]]]:
    """Look up admin-managed creds in `oauth_app_credentials`. Returns
    None if no row for this tenant+provider. Async because it hits the DB."""
    if not tenant_id:
        return None
    # Local import keeps this module importable from places that don't have
    # the DB engine wired up (tests, scripts).
    from integration_service.common.db import get_sessionmaker
    from integration_service.repositories.oauth_apps import (
        OAuthAppCredentialsRepo,
    )

    factory = get_sessionmaker()
    async with factory() as s:
        repo = OAuthAppCredentialsRepo(s)
        row = await repo.get(tenant_id, kind)
        # Fallback: in single-tenant deployments the admin lives in the
        # `system` tenant and configures one global PlagLens OAuth app. We let
        # other tenants (e.g. `hse-fkn`) reuse those creds rather than fail.
        if row is None:
            row = await repo.get_any(kind)
        if row is None:
            return None
        return {
            "client_id": row.client_id,
            "client_secret": row.client_secret,
            "redirect_uri": row.redirect_uri,
            "scope": row.scope,
        }


def get_provider(kind: str, config: Any = None) -> Optional[OAuthProvider]:
    """Build the provider from `.env.local` defaults (synchronous)."""
    s = get_settings()
    if kind == "stepik":
        return OAuthProvider(
            name="stepik",
            authorize_url=s.stepik_oauth_authorize_url,
            token_url=s.stepik_oauth_token_url,
            client_id=_from_config(config, "client_id") or s.stepik_oauth_client_id,
            client_secret=_from_config(config, "client_secret") or s.stepik_oauth_client_secret,
            redirect_uri=_from_config(config, "redirect_uri") or s.stepik_oauth_redirect_uri,
            scope=_from_config(config, "scope") or s.stepik_oauth_scope,
        )
    if kind == "yandex_contest":
        return OAuthProvider(
            name="yandex_contest",
            authorize_url=s.yandex_contest_oauth_authorize_url,
            token_url=s.yandex_contest_oauth_token_url,
            client_id=_from_config(config, "client_id") or s.yandex_contest_oauth_client_id,
            client_secret=_from_config(config, "client_secret") or s.yandex_contest_oauth_client_secret,
            redirect_uri=_from_config(config, "redirect_uri") or s.yandex_contest_oauth_redirect_uri,
            scope=_from_config(config, "scope") or s.yandex_contest_oauth_scope,
        )
    if kind == "google_sheets":
        # Per-teacher OAuth path. Admin's tenant-level SA config (also of
        # kind ``google_sheets``, marked ``settings.auth_mode='sa'``) is
        # handled separately — those configs never invoke this flow
        # because the OAuth-start endpoint refuses without ``client_id``.
        return OAuthProvider(
            name="google_sheets",
            authorize_url=s.google_oauth_authorize_url,
            token_url=s.google_oauth_token_url,
            client_id=_from_config(config, "client_id") or s.google_oauth_client_id,
            client_secret=_from_config(config, "client_secret") or s.google_oauth_client_secret,
            redirect_uri=_from_config(config, "redirect_uri") or s.google_oauth_redirect_uri,
            scope=_from_config(config, "scope") or s.google_oauth_scope,
            # ``access_type=offline`` makes Google issue a refresh_token
            # the first time; ``prompt=consent`` re-issues it on
            # subsequent flows (silent re-auth would skip it).
            extra_params={"access_type": "offline", "prompt": "consent"},
        )
    return None


async def get_provider_for_tenant(
    kind: str, tenant_id: Optional[str], config: Any = None
) -> Optional[OAuthProvider]:
    """Async variant: same as get_provider() but checks the admin-managed
    `oauth_app_credentials` table FIRST, then falls back through per-config
    settings → `.env.local` defaults. Use this from API handlers; tests can
    keep using the sync get_provider().
    """
    db = await _from_db(kind, tenant_id)
    base = get_provider(kind, config)
    if base is None:
        return None
    if db is not None:
        return OAuthProvider(
            name=base.name,
            authorize_url=base.authorize_url,
            token_url=base.token_url,
            client_id=db["client_id"] or base.client_id,
            client_secret=db["client_secret"] or base.client_secret,
            redirect_uri=db["redirect_uri"] or base.redirect_uri,
            scope=db["scope"] or base.scope,
        )
    return base


async def create_state(config_id: str, tenant_id: str, ttl_seconds: Optional[int] = None) -> str:
    """Generate a cryptographic state token tied to a config and store in Redis."""
    s = get_settings()
    ttl = ttl_seconds or s.oauth_state_ttl_seconds
    state = secrets.token_urlsafe(32)
    redis = get_redis()
    await redis.set(
        OAUTH_STATE_PREFIX + state,
        json.dumps({"config_id": config_id, "tenant_id": tenant_id}),
        ex=ttl,
    )
    return state


async def consume_state(state: str) -> Optional[dict[str, Any]]:
    """Validate a state and return ``{config_id, tenant_id}`` if valid."""
    if not state:
        return None
    redis = get_redis()
    raw = await redis.get(OAUTH_STATE_PREFIX + state)
    if not raw:
        return None
    await redis.delete(OAUTH_STATE_PREFIX + state)
    try:
        return json.loads(raw)
    except Exception:
        return None


def build_authorize_url(provider: OAuthProvider, state: str) -> str:
    params: dict[str, str] = {
        "response_type": "code",
        "client_id": provider.client_id or "",
        "redirect_uri": provider.redirect_uri,
        "state": state,
    }
    if provider.scope:
        params["scope"] = provider.scope
    if provider.extra_params:
        params.update(provider.extra_params)
    sep = "&" if "?" in provider.authorize_url else "?"
    return f"{provider.authorize_url}{sep}{urlencode(params)}"


async def exchange_code(provider: OAuthProvider, code: str) -> dict[str, Any]:
    """POST code → access/refresh tokens. Returns the raw provider response."""
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": provider.client_id or "",
        "client_secret": provider.client_secret or "",
        "redirect_uri": provider.redirect_uri,
    }
    async with httpx.AsyncClient(timeout=get_settings().httpx_timeout_seconds) as client:
        resp = await client.post(provider.token_url, data=data)
        resp.raise_for_status()
        return resp.json()


async def refresh_token(provider: OAuthProvider, refresh_token_value: str) -> dict[str, Any]:
    data = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token_value,
        "client_id": provider.client_id or "",
        "client_secret": provider.client_secret or "",
    }
    async with httpx.AsyncClient(timeout=get_settings().httpx_timeout_seconds) as client:
        resp = await client.post(provider.token_url, data=data)
        resp.raise_for_status()
        return resp.json()


async def store_tokens(config_id: str, tokens: dict[str, Any]) -> None:
    """Store access_token in Redis (TTL = expires_in - 60s), refresh_token under
    ``oauth:token:{config_id}:refresh`` for separate (longer) lifetime."""
    redis = get_redis()
    access = tokens.get("access_token")
    expires_in = int(tokens.get("expires_in", 3600))
    if access:
        await redis.set(
            OAUTH_TOKEN_PREFIX + config_id + ":access",
            str(access),
            ex=max(60, expires_in - 60),
        )
    refresh = tokens.get("refresh_token")
    if refresh:
        await redis.set(
            OAUTH_TOKEN_PREFIX + config_id + ":refresh",
            str(refresh),
        )


async def get_access_token(config_id: str) -> Optional[str]:
    redis = get_redis()
    raw = await redis.get(OAUTH_TOKEN_PREFIX + config_id + ":access")
    return str(raw) if raw else None


async def get_refresh_token(config_id: str) -> Optional[str]:
    redis = get_redis()
    raw = await redis.get(OAUTH_TOKEN_PREFIX + config_id + ":refresh")
    return str(raw) if raw else None


async def delete_tokens(config_id: str) -> None:
    redis = get_redis()
    await redis.delete(OAUTH_TOKEN_PREFIX + config_id + ":access")
    await redis.delete(OAUTH_TOKEN_PREFIX + config_id + ":refresh")
