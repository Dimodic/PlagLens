"""Vault secret resolution — no live Vault / hvac required (fake client)."""
from __future__ import annotations

from typing import Any

import pytest

from plaglens_common.secrets import (
    PLACEHOLDER,
    VaultClient,
    resolve_secret,
    set_vault_client,
)


class _FakeKvV2:
    def __init__(self, store: dict[str, dict[str, Any]]):
        self._store = store

    def read_secret_version(self, *, path: str, mount_point: str):
        if path not in self._store:
            raise KeyError(path)
        return {"data": {"data": self._store[path]}}


class _FakeClient:
    def __init__(self, store: dict[str, dict[str, Any]]):
        self.secrets = type("S", (), {})()
        self.secrets.kv = type("KV", (), {})()
        self.secrets.kv.v2 = _FakeKvV2(store)


def _client(store: dict[str, dict[str, Any]]) -> VaultClient:
    return VaultClient(client=_FakeClient(store))


def test_get_secret_returns_key_value():
    vc = _client({"plaglens/llm/openai": {"api_key": "sk-real", "base_url": "u"}})
    assert vc.get_secret("llm/openai", "api_key") == "sk-real"
    assert vc.get_secret("llm/openai") == {"api_key": "sk-real", "base_url": "u"}


def test_base_path_is_prepended_once():
    vc = _client({"plaglens/jwt": {"kid": "dev-1"}})
    # Accept both the bare and already-prefixed forms.
    assert vc.get_secret("jwt", "kid") == "dev-1"
    assert vc.get_secret("plaglens/jwt", "kid") == "dev-1"


def test_placeholder_is_treated_as_missing():
    vc = _client({"plaglens/llm/openai": {"api_key": PLACEHOLDER}})
    assert vc.get_secret("llm/openai", "api_key") is None


def test_missing_path_returns_none():
    vc = _client({})
    assert vc.get_secret("nope", "api_key") is None


def test_unconfigured_client_returns_none(monkeypatch):
    # No VAULT_ADDR/TOKEN and no injected client -> graceful None, no raise.
    monkeypatch.delenv("VAULT_ADDR", raising=False)
    monkeypatch.delenv("VAULT_TOKEN", raising=False)
    vc = VaultClient()
    assert vc.get_secret("llm/openai", "api_key") is None


def test_resolve_secret_env_wins():
    set_vault_client(_client({"plaglens/llm/openai": {"api_key": "from-vault"}}))
    try:
        assert (
            resolve_secret("from-env", path="llm/openai", key="api_key") == "from-env"
        )
        # Env unset -> Vault is consulted.
        assert (
            resolve_secret(None, path="llm/openai", key="api_key") == "from-vault"
        )
        # Neither -> default.
        assert (
            resolve_secret(None, path="missing", key="api_key", default="d") == "d"
        )
    finally:
        set_vault_client(None)


@pytest.mark.parametrize("env_value", ["", None])
def test_resolve_secret_falls_through_empty_env(env_value):
    set_vault_client(_client({"plaglens/x": {"k": "v"}}))
    try:
        assert resolve_secret(env_value, path="x", key="k") == "v"
    finally:
        set_vault_client(None)
