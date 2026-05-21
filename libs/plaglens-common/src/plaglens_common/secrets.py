"""Vault-backed secret resolution (HashiCorp Vault KV v2).

Secrets in PlagLens follow a 12-factor precedence: an explicit environment
variable always wins (operators override per-deploy), and Vault is the shared
*source of truth* consulted when the env var is unset. This module provides the
thin, lazily-initialised Vault client plus a ``resolve_secret`` helper that
encodes that precedence.

Design goals
------------
- **Graceful degradation.** If ``hvac`` is not installed, ``VAULT_ADDR`` /
  ``VAULT_TOKEN`` are unset, Vault is unreachable, or the path is missing, every
  call returns ``None`` instead of raising. Services keep booting from env.
- **Placeholder-aware.** The dev seed (``infra/init/vault/seed-secrets.sh``)
  writes ``REPLACE_ME`` placeholders so containers boot without real creds;
  these are treated as "not configured" so they never mask a real env value.
- **Testable without a live Vault.** Inject a fake client via
  :func:`set_vault_client` (or construct :class:`VaultClient` with ``client=``)
  so unit tests need neither ``hvac`` nor a server.
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

# Dev-seed placeholder value; treated as "unset" so it never shadows a real env.
PLACEHOLDER = "REPLACE_ME"


class VaultClient:
    """Minimal KV v2 reader over ``hvac`` with graceful fallback to ``None``."""

    def __init__(
        self,
        *,
        addr: str | None = None,
        token: str | None = None,
        mount_point: str = "secret",
        base_path: str = "plaglens",
        client: Any | None = None,
    ) -> None:
        self._addr = addr if addr is not None else os.environ.get("VAULT_ADDR")
        self._token = token if token is not None else os.environ.get("VAULT_TOKEN")
        self._mount_point = mount_point
        self._base_path = base_path.strip("/")
        self._client = client
        # None = not yet attempted; True/False = resolved availability.
        self._available: bool | None = None if client is None else True

    def _full_path(self, path: str) -> str:
        path = path.strip("/")
        if self._base_path and not path.startswith(self._base_path + "/") and path != self._base_path:
            return f"{self._base_path}/{path}"
        return path

    def _ensure_client(self) -> Any | None:
        if self._client is not None:
            return self._client
        if self._available is False:
            return None
        if not self._addr or not self._token:
            self._available = False
            return None
        try:
            import hvac  # type: ignore[import-not-found]

            self._client = hvac.Client(url=self._addr, token=self._token)
            self._available = True
        except Exception as exc:  # pragma: no cover - depends on hvac/infra
            logger.info("vault.unavailable", exc_info=False)
            logger.debug("vault.unavailable.detail error=%s", exc)
            self._available = False
            self._client = None
        return self._client

    def get_secret(self, path: str, key: str | None = None) -> Any | None:
        """Read a KV v2 secret. Returns the value for ``key`` (or the whole
        data dict when ``key`` is ``None``), or ``None`` on any failure.

        ``REPLACE_ME`` placeholder values are returned as ``None`` so they never
        shadow a configured environment variable.
        """
        client = self._ensure_client()
        if client is None:
            return None
        try:
            resp = client.secrets.kv.v2.read_secret_version(
                path=self._full_path(path), mount_point=self._mount_point
            )
            data = resp["data"]["data"]
        except Exception as exc:  # pragma: no cover - depends on infra
            logger.debug("vault.read_failed path=%s error=%s", path, exc)
            return None
        if key is None:
            return data
        value = data.get(key)
        if value == PLACEHOLDER:
            return None
        return value


_vault: VaultClient | None = None


def get_vault() -> VaultClient:
    """Process-wide cached :class:`VaultClient` built from the environment."""
    global _vault
    if _vault is None:
        _vault = VaultClient()
    return _vault


def set_vault_client(client: VaultClient | None) -> None:
    """Replace the cached client (tests / explicit wiring). ``None`` resets it."""
    global _vault
    _vault = client


def resolve_secret(
    env_value: str | None,
    *,
    path: str,
    key: str,
    default: str | None = None,
) -> str | None:
    """12-factor secret precedence: explicit env value → Vault → ``default``.

    Pass the already-read environment value (or ``None``). If it is falsy, the
    seeded Vault secret at ``secret/plaglens/{path}`` key ``key`` is consulted;
    if that is missing/placeholder/unreachable, ``default`` is returned.
    """
    if env_value:
        return env_value
    vault_value = get_vault().get_secret(path, key)
    if vault_value:
        return str(vault_value)
    return default


__all__ = [
    "PLACEHOLDER",
    "VaultClient",
    "get_vault",
    "resolve_secret",
    "set_vault_client",
]
