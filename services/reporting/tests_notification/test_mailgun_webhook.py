"""Tests for the public Mailgun webhook endpoint.

Covers signature verification, bounce parsing, and the hard-bounce threshold
that flips ``NotificationPreference.email_disabled``.
"""
from __future__ import annotations

import hashlib
import hmac
import os
import time
from typing import Any

import pytest
from sqlalchemy import select

from notification_service.config import reset_settings_cache
from notification_service.db import session_scope
from notification_service.models import EmailBounce, NotificationPreference

HEADERS = {"X-User-Id": "usr_test", "X-Tenant-Id": "tnt_test", "X-Role": "admin"}


def _sign(signing_key: str, token: str, ts: str) -> str:
    return hmac.new(
        signing_key.encode("utf-8"),
        f"{ts}{token}".encode(),
        hashlib.sha256,
    ).hexdigest()


def _payload(
    *,
    event: str,
    recipient: str,
    severity: str = "permanent",
    user_id: str | None = "usr_test",
    signing_key: str | None = None,
) -> dict[str, Any]:
    ts = str(int(time.time()))
    token = "test-token-abc"
    sig = _sign(signing_key, token, ts) if signing_key else "skip"
    return {
        "signature": {"token": token, "timestamp": ts, "signature": sig},
        "event-data": {
            "event": event,
            "severity": severity,
            "recipient": recipient,
            "delivery-status": {"description": f"{event} description"},
            "user-variables": {"user_id": user_id} if user_id else {},
        },
    }


@pytest.mark.asyncio
async def test_webhook_rejects_bad_signature(client, monkeypatch):
    monkeypatch.setenv("MAILGUN_WEBHOOK_SIGNING_KEY", "secret-1")
    reset_settings_cache()
    body = _payload(event="failed", recipient="x@example.com", signing_key="WRONG")
    r = await client.post(
        "/api/v1/webhooks/mailgun/tnt_test", json=body, headers={}
    )
    assert r.status_code == 401


@pytest.mark.asyncio
async def test_webhook_accepts_correct_signature_and_records_bounce(client, monkeypatch):
    monkeypatch.setenv("MAILGUN_WEBHOOK_SIGNING_KEY", "secret-1")
    reset_settings_cache()
    body = _payload(
        event="failed", recipient="x@example.com", signing_key="secret-1"
    )
    r = await client.post(
        "/api/v1/webhooks/mailgun/tnt_test", json=body, headers={}
    )
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["ok"] is True
    assert j["stored"] is True
    assert j["kind"] == "hard"

    # Verify a row was actually stored.
    async with session_scope() as session:
        rows = (await session.execute(select(EmailBounce))).scalars().all()
        assert any(b.email == "x@example.com" for b in rows)


@pytest.mark.asyncio
async def test_webhook_temporary_failure_is_soft(client, monkeypatch):
    monkeypatch.delenv("MAILGUN_WEBHOOK_SIGNING_KEY", raising=False)
    reset_settings_cache()
    body = _payload(
        event="temporary_failure", recipient="soft@example.com", severity="temporary"
    )
    # No signature required when signing key is empty.
    body["signature"] = {"token": "x", "timestamp": "0", "signature": ""}
    r = await client.post(
        "/api/v1/webhooks/mailgun/tnt_test", json=body, headers={}
    )
    assert r.status_code == 200
    assert r.json()["kind"] == "soft"


@pytest.mark.asyncio
async def test_webhook_delivered_event_is_ignored(client, monkeypatch):
    monkeypatch.delenv("MAILGUN_WEBHOOK_SIGNING_KEY", raising=False)
    reset_settings_cache()
    body = _payload(
        event="delivered", recipient="ok@example.com", severity="ok"
    )
    body["signature"] = {"token": "x", "timestamp": "0", "signature": ""}
    r = await client.post(
        "/api/v1/webhooks/mailgun/tnt_test", json=body, headers={}
    )
    assert r.status_code == 200
    assert r.json().get("stored") is False


@pytest.mark.asyncio
async def test_webhook_threshold_disables_user_email(client, monkeypatch):
    """Three hard bounces must flip the user's NotificationPreference.email_disabled."""
    monkeypatch.delenv("MAILGUN_WEBHOOK_SIGNING_KEY", raising=False)
    monkeypatch.setenv("EMAIL_HARD_BOUNCES_THRESHOLD", "3")
    reset_settings_cache()

    # Seed a preference row for the user.
    async with session_scope() as session:
        pref = NotificationPreference(
            user_id="usr_target",
            tenant_id="tnt_test",
            channels_enabled={"inapp": True, "email": True, "telegram": False},
            email_digest_frequency="instant",
            per_event={},
            email="bouncey@example.com",
        )
        session.add(pref)
        await session.flush()

    target_email = "bouncey@example.com"
    for _ in range(3):
        body = _payload(
            event="failed",
            recipient=target_email,
            severity="permanent",
            user_id="usr_target",
        )
        body["signature"] = {"token": "x", "timestamp": "0", "signature": ""}
        r = await client.post(
            "/api/v1/webhooks/mailgun/tnt_test", json=body, headers={}
        )
        assert r.status_code == 200

    last = r.json()
    assert last["user_disabled"] is True

    async with session_scope() as session:
        pref = await session.get(NotificationPreference, "usr_target")
        assert pref is not None
        assert pref.email_disabled is True


@pytest.mark.asyncio
async def test_admin_bounces_listing_returns_rows(client, monkeypatch):
    """GET /admin/.../bounces returns rows pushed by webhook."""
    monkeypatch.delenv("MAILGUN_WEBHOOK_SIGNING_KEY", raising=False)
    reset_settings_cache()
    body = _payload(event="failed", recipient="listme@example.com")
    body["signature"] = {"token": "x", "timestamp": "0", "signature": ""}
    r = await client.post("/api/v1/webhooks/mailgun/tnt_test", json=body, headers={})
    assert r.status_code == 200

    r = await client.get(
        "/api/v1/admin/notifications/email-config/bounces",
        headers=HEADERS,
    )
    assert r.status_code == 200
    body = r.json()
    assert any(item["email"] == "listme@example.com" for item in body["data"])


# Cleanup: clear env between tests so leakage doesn't break other suites.
@pytest.fixture(autouse=True)
def _scrub_env():
    keys = (
        "MAILGUN_WEBHOOK_SIGNING_KEY",
        "EMAIL_HARD_BOUNCES_THRESHOLD",
    )
    saved = {k: os.environ.get(k) for k in keys}
    yield
    for k, v in saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v
    reset_settings_cache()
