"""Smoke tests for notifications + preferences + inapp channel."""
from __future__ import annotations

import pytest

from notification_service.db import session_scope
from notification_service.delivery import create_notification, deliver_notification
from notification_service.models import NotificationPreference

HEADERS = {"X-User-Id": "usr_test", "X-Tenant-Id": "tnt_test", "X-Role": "admin"}


@pytest.mark.asyncio
async def test_health(client):
    r = await client.get("/healthz")
    assert r.status_code == 200
    r = await client.get("/v1/version")
    assert r.status_code == 200
    assert "version" in r.json()


@pytest.mark.asyncio
async def test_list_empty(client):
    r = await client.get("/api/v1/notifications", headers=HEADERS)
    assert r.status_code == 200
    body = r.json()
    assert body["data"] == []
    assert body["pagination"]["has_more"] is False


@pytest.mark.asyncio
async def test_create_and_mark_read(client, captures):
    async with session_scope() as session:
        pref = NotificationPreference(
            user_id="usr_test",
            tenant_id="tnt_test",
            channels_enabled={"inapp": True, "email": False, "telegram": False},
            email_digest_frequency="instant",
            per_event={},
        )
        session.add(pref)
        await session.flush()
        n = await create_notification(
            session,
            user_id="usr_test",
            tenant_id="tnt_test",
            event_type="test",
            title="Hello",
            body="World",
        )
        await deliver_notification(session, n, channels=["inapp"], pref=pref)
        nid = n.id

    assert len(captures["inapp"].calls) == 1

    r = await client.get("/api/v1/notifications", headers=HEADERS)
    assert r.status_code == 200
    items = r.json()["data"]
    assert len(items) == 1
    assert items[0]["title"] == "Hello"
    assert items[0]["read_at"] is None

    r = await client.get("/api/v1/notifications/unread-count", headers=HEADERS)
    assert r.status_code == 200
    assert r.json()["unread"] == 1

    r = await client.post(
        "/api/v1/notifications:markRead", json={"ids": [nid]}, headers=HEADERS
    )
    assert r.status_code == 200
    assert r.json()["updated"] == 1

    r = await client.get("/api/v1/notifications/unread-count", headers=HEADERS)
    assert r.json()["unread"] == 0


@pytest.mark.asyncio
async def test_preferences_update(client):
    r = await client.get(
        "/api/v1/users/me/notification-preferences", headers=HEADERS
    )
    assert r.status_code == 200
    body = r.json()
    assert body["channels_enabled"]["inapp"] is True

    payload = {
        "channels_enabled": {"telegram": True},
        "email_digest_frequency": "daily",
        "quiet_hours": {"start": "22:00", "end": "07:00", "timezone": "Europe/Moscow"},
        "locale": "ru",
        "email": "user@example.com",
        "telegram_chat_id": "12345",
    }
    r = await client.patch(
        "/api/v1/users/me/notification-preferences", json=payload, headers=HEADERS
    )
    assert r.status_code == 200
    body = r.json()
    assert body["channels_enabled"]["telegram"] is True
    assert body["email_digest_frequency"] == "daily"
    assert body["quiet_hours"]["start"] == "22:00"
    assert body["email"] == "user@example.com"


@pytest.mark.asyncio
async def test_send_test_through_inapp(client, captures):
    payload = {"channel": "inapp", "title": "Test", "body": "Body"}
    r = await client.post(
        "/api/v1/users/me/notifications/test", json=payload, headers=HEADERS
    )
    assert r.status_code == 200
    body = r.json()
    assert body["channels"]["inapp"] in ("sent", "delivered")
    assert len(captures["inapp"].calls) == 1
    assert captures["inapp"].calls[0].title == "Test"


@pytest.mark.asyncio
async def test_available_events(client):
    r = await client.get(
        "/api/v1/users/me/notification-preferences/available-events", headers=HEADERS
    )
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    assert any(it["event_type"] == "submission.grade.assigned.v1" for it in items)


@pytest.mark.asyncio
async def test_sse_basic_stream(app):
    """Smoke: SSE handshake returns 200 and event-stream content-type.

    We use a hand-rolled ASGI receive/send instead of httpx.stream(), because
    the SSE endpoint never closes its body (by design) and httpx's ASGITransport
    blocks indefinitely on context exit waiting for the stream to drain.
    """
    sent_messages: list[dict] = []
    sent_event = __import__("asyncio").Event()
    receive_q: list[dict] = [
        {"type": "http.request", "body": b"", "more_body": False},
    ]

    async def receive():
        if receive_q:
            return receive_q.pop(0)
        # After the request body, simulate disconnect so SSE generator stops.
        await sent_event.wait()
        return {"type": "http.disconnect"}

    async def send(message):
        sent_messages.append(message)
        if message.get("type") == "http.response.body":
            sent_event.set()

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "GET",
        "scheme": "http",
        "server": ("test", 80),
        "client": ("test", 0),
        "root_path": "",
        "path": "/api/v1/notifications/stream",
        "raw_path": b"/api/v1/notifications/stream",
        "query_string": b"",
        "headers": [
            (k.lower().encode(), v.encode()) for k, v in HEADERS.items()
        ],
    }
    import asyncio as _asyncio

    try:
        await _asyncio.wait_for(app(scope, receive, send), timeout=3.0)
    except TimeoutError:
        pass

    starts = [m for m in sent_messages if m.get("type") == "http.response.start"]
    bodies = [m for m in sent_messages if m.get("type") == "http.response.body"]
    assert starts, "no response.start received"
    assert starts[0]["status"] == 200
    headers_dict = {k.decode(): v.decode() for k, v in starts[0]["headers"]}
    assert "text/event-stream" in headers_dict.get("content-type", "")
    assert bodies, "no body chunks emitted by SSE generator"


@pytest.mark.asyncio
async def test_admin_template_crud(client):
    payload = {
        "event_type": "test",
        "locale": "ru",
        "channel": "inapp",
        "subject_template": "Hello {{ name }}",
        "body_template": "Body {{ name }}",
        "active": True,
        "version": 1,
    }
    r = await client.post(
        "/api/v1/admin/notifications/templates", json=payload, headers=HEADERS
    )
    assert r.status_code == 201
    tid = r.json()["id"]
    r = await client.get(
        f"/api/v1/admin/notifications/templates/{tid}", headers=HEADERS
    )
    assert r.status_code == 200
    r = await client.post(
        f"/api/v1/admin/notifications/templates/{tid}:preview",
        json={"data": {"name": "World"}},
        headers=HEADERS,
    )
    assert r.status_code == 200
    body = r.json()
    assert body["subject"] == "Hello World"
    assert body["body"] == "Body World"


@pytest.mark.asyncio
async def test_delete_notification_archives(client):
    # Create directly via inapp test send
    r = await client.post(
        "/api/v1/users/me/notifications/test",
        json={"channel": "inapp", "title": "X", "body": "Y"},
        headers=HEADERS,
    )
    assert r.status_code == 200
    nid = r.json()["notification_id"]
    r = await client.delete(f"/api/v1/notifications/{nid}", headers=HEADERS)
    assert r.status_code == 204
    r = await client.get("/api/v1/notifications", headers=HEADERS)
    assert r.json()["data"] == []
