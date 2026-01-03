"""Webhook subscription endpoints + incoming hook."""
from __future__ import annotations

from tests.conftest import admin_headers


async def test_create_and_list_subscription(client):
    resp = await client.post(
        "/api/v1/admin/plagiarism/webhook-subscriptions",
        json={
            "url": "https://example.com/hook",
            "events": ["plaglens.plagiarism.run.completed.v1"],
            "secret": "supersecret-very-long",
        },
        headers=admin_headers(),
    )
    assert resp.status_code == 201
    sub = resp.json()
    assert sub["url"] == "https://example.com/hook"

    listed = await client.get(
        "/api/v1/admin/plagiarism/webhook-subscriptions", headers=admin_headers()
    )
    assert listed.status_code == 200
    assert any(s["id"] == sub["id"] for s in listed.json()["data"])


async def test_incoming_webhook_accepts_anything(client):
    resp = await client.post(
        "/api/v1/webhooks/plagiarism/codequiry/plg_x",
        content=b"{\"ok\": true}",
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 200
    assert resp.json()["received"] is True
