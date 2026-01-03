from __future__ import annotations

import pytest


def test_redact_sensitive_keys_redacts() -> None:
    pytest.importorskip("structlog")

    from plaglens_common.logging import _redact_sensitive

    out = _redact_sensitive(None, "info", {"password": "secret", "user_id": "u1"})
    assert out["password"] == "[REDACTED]"
    assert out["user_id"] == "u1"


def test_configure_structlog_runs_without_error() -> None:
    pytest.importorskip("structlog")

    from plaglens_common.logging import configure_structlog

    configure_structlog("plaglens-test", level="DEBUG")


def test_configure_structlog_falls_back_when_not_installed(monkeypatch: pytest.MonkeyPatch) -> None:
    import plaglens_common.logging as mod

    monkeypatch.setattr(mod, "structlog", None)
    mod.configure_structlog("svc", level="INFO")
