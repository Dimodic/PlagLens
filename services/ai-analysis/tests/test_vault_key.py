"""resolve_api_key() falls back to Vault when no env key is configured.

Uses an injected fake Vault client, so neither hvac nor a live Vault is needed.
"""
from __future__ import annotations

from typing import Any

from plaglens_common.secrets import VaultClient, set_vault_client

from ai_analysis_service.config import Settings


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


def _inject(store: dict[str, dict[str, Any]]) -> None:
    set_vault_client(VaultClient(client=_FakeClient(store)))


def test_resolve_api_key_uses_vault_when_env_unset(monkeypatch):
    for var in ("OPENROUTER_API_KEY", "OPENAI_API_KEY", "OPENAI_API_KEY_PATH"):
        monkeypatch.delenv(var, raising=False)
    _inject({"plaglens/llm/openai": {"api_key": "sk-from-vault"}})
    try:
        s = Settings(
            OPENROUTER_API_KEY=None, OPENAI_API_KEY=None, OPENAI_API_KEY_PATH=None
        )
        assert s.resolve_api_key() == "sk-from-vault"
    finally:
        set_vault_client(None)


def test_env_key_beats_vault():
    _inject({"plaglens/llm/openai": {"api_key": "sk-from-vault"}})
    try:
        s = Settings(OPENROUTER_API_KEY="sk-from-env")
        assert s.resolve_api_key() == "sk-from-env"
    finally:
        set_vault_client(None)


def test_no_key_anywhere_returns_none(monkeypatch):
    for var in ("OPENROUTER_API_KEY", "OPENAI_API_KEY", "OPENAI_API_KEY_PATH"):
        monkeypatch.delenv(var, raising=False)
    _inject({})  # Vault has nothing
    try:
        s = Settings(
            OPENROUTER_API_KEY=None, OPENAI_API_KEY=None, OPENAI_API_KEY_PATH=None
        )
        assert s.resolve_api_key() is None
    finally:
        set_vault_client(None)
