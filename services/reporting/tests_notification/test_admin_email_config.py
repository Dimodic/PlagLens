"""Tests for admin email-config endpoints (GET/PATCH/test/dns-status)."""
from __future__ import annotations

import pytest

HEADERS = {"X-User-Id": "usr_test", "X-Tenant-Id": "tnt_test", "X-Role": "admin"}


@pytest.mark.asyncio
async def test_get_email_config_creates_default(client):
    r = await client.get(
        "/api/v1/admin/notifications/email-config", headers=HEADERS
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["from_email"]
    assert body["provider"] in ("smtp", "mailgun")


@pytest.mark.asyncio
async def test_patch_email_config_hot_reload(client, captures):
    payload = {
        "provider": "smtp",
        "from_email": "robot@example.com",
        "from_name": "RobotName",
    }
    r = await client.patch(
        "/api/v1/admin/notifications/email-config",
        json=payload,
        headers=HEADERS,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["from_email"] == "robot@example.com"
    assert body["from_name"] == "RobotName"


@pytest.mark.asyncio
async def test_test_email_uses_current_channel(client, captures):
    r = await client.post(
        "/api/v1/admin/notifications/email-config:test", headers=HEADERS
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] in ("sent", "delivered", "skipped", "failed")
    # The capturing channel should have observed the test send.
    assert len(captures["email"].calls) == 1
    sent = captures["email"].calls[0]
    assert sent.title.startswith("PlagLens email config test")


@pytest.mark.asyncio
async def test_dns_status_smtp_returns_na(client):
    r = await client.get(
        "/api/v1/admin/notifications/email-config/dns-status", headers=HEADERS
    )
    assert r.status_code == 200
    j = r.json()
    # smtp / dev-mode → all-false (n/a).
    assert j["spf"] is False
    assert j["dkim"] is False
    assert j["dmarc"] is False
    assert "checked_at" in j


@pytest.mark.asyncio
async def test_internal_email_direct(client, captures):
    payload = {
        "user_id": "usr_target",
        "tenant_id": "tnt_test",
        "recipient": "verify@example.com",
        "subject": "Verify your email — {{ user_name }}",
        "body_html": "<p>Hi {{ user_name }}, click {{ verify_url }}</p>",
        "context": {
            "user_name": "Bob",
            "verify_url": "https://plaglens.local/v/123",
        },
        "event_type": "auth.email.verify.v1",
    }
    r = await client.post(
        "/api/v1/internal/notifications/email-direct",
        json=payload,
        headers=HEADERS,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert "notification_id" in body
    assert body["status"] in ("sent", "delivered")
    sent = captures["email"].calls[-1]
    assert sent.recipient_email == "verify@example.com"
    assert "Bob" in sent.title
    assert "https://plaglens.local/v/123" in sent.body
