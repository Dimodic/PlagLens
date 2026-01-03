import hashlib
import hmac
import json


async def test_stepik_webhook_idempotent(client, settings):
    body = json.dumps({"event_id": "evt-1", "kind": "submission.new"}).encode("utf-8")
    sig = hmac.new(
        settings.webhook_secret_stepik.encode("utf-8"), body, hashlib.sha256
    ).hexdigest()
    headers = {"X-Signature": sig, "Content-Type": "application/json"}
    r1 = await client.post("/api/v1/webhooks/stepik/tnt_x", content=body, headers=headers)
    assert r1.status_code == 200
    assert r1.json()["duplicate"] is False

    r2 = await client.post("/api/v1/webhooks/stepik/tnt_x", content=body, headers=headers)
    assert r2.status_code == 200
    assert r2.json()["duplicate"] is True


async def test_telegram_webhook(client):
    body = json.dumps({"update_id": 42, "message": {"chat": {"id": 1}}}).encode("utf-8")
    r = await client.post(
        "/api/v1/webhooks/telegram",
        content=body,
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 200


async def test_plagiarism_webhook(client):
    body = json.dumps({"event_id": "p-1", "score": 0.4}).encode("utf-8")
    sig = hmac.new(
        b"plagiarism-test-secret", body, hashlib.sha256
    ).hexdigest()
    r = await client.post(
        "/api/v1/webhooks/plagiarism/internal/run-1",
        content=body,
        headers={"X-Signature": sig, "Content-Type": "application/json"},
    )
    assert r.status_code == 200
    assert r.json()["ok"] is True


async def test_llm_webhook(client):
    body = json.dumps({"event_id": "l-1"}).encode("utf-8")
    r = await client.post(
        "/api/v1/webhooks/llm/openai",
        content=body,
        headers={"Content-Type": "application/json"},
    )
    assert r.status_code == 200
