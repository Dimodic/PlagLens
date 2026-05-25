"""In-process cache of admin-edited OAuth provider credentials.

OAuth client_id/client_secret pairs are configured in two layers:

1. Boot-time fallback from environment variables (``GOOGLE_CLIENT_ID`` …).
2. Optional admin override stored in ``oauth_provider_overrides`` and edited
   from the admin UI.

The legacy code path resolves credentials synchronously via
``settings.oauth_credentials(provider)`` from many call sites
(``build_authorize_url`` and friends) — refactoring all of them to be async
and to take a SQLAlchemy session would be invasive. Instead this module
keeps the override in memory:

* on service startup, :func:`reload_from_db` reads every override row;
* the admin PATCH endpoint calls :func:`set_override` after committing the
  DB write so the new credentials become visible to all callers
  immediately, without a restart;
* ``settings.oauth_credentials`` checks :func:`get_override` first and
  only falls through to env when nothing is cached.

The cache is a plain dict guarded by a thread-safe lock; that is enough
because identity runs as a single async process and Uvicorn workers, when
present, each carry their own cache and reload it independently.
"""
from __future__ import annotations

import threading
from typing import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import OAuthProviderOverride

_lock = threading.Lock()
_cache: dict[str, tuple[str, str]] = {}


def get_override(provider: str) -> tuple[str, str] | None:
    """Return ``(client_id, client_secret)`` for ``provider`` or ``None``.

    Only returns a value when BOTH halves are non-empty. A row that holds
    only a client_id (or only the secret) is treated as "not yet
    configured" and the env fallback is used instead.
    """
    with _lock:
        return _cache.get(provider)


def set_override(provider: str, client_id: str, client_secret: str) -> None:
    """Update the cache for ``provider`` (no DB write).

    Pass ``""`` for either value to mean "cleared" — the cache then evicts
    the entry so callers fall back to env again.
    """
    with _lock:
        if client_id and client_secret:
            _cache[provider] = (client_id, client_secret)
        else:
            _cache.pop(provider, None)


def clear_override(provider: str) -> None:
    """Drop the cached override for ``provider``."""
    with _lock:
        _cache.pop(provider, None)


def snapshot() -> dict[str, tuple[str, str]]:
    """Return a copy of the entire cache — handy for diagnostics."""
    with _lock:
        return dict(_cache)


async def reload_from_db(session: AsyncSession) -> int:
    """Replace the cache with the contents of ``oauth_provider_overrides``.

    Returns the number of providers that had a usable (both halves set)
    override after the reload. Safe to call repeatedly.
    """
    rows: Iterable[OAuthProviderOverride] = (
        (await session.execute(select(OAuthProviderOverride))).scalars().all()
    )
    fresh: dict[str, tuple[str, str]] = {}
    for row in rows:
        cid = (row.client_id or "").strip()
        csec = (row.client_secret or "").strip()
        if cid and csec:
            fresh[row.provider] = (cid, csec)
    with _lock:
        _cache.clear()
        _cache.update(fresh)
    return len(fresh)
