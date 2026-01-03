from __future__ import annotations

import json
from typing import Any

import pytest

from plaglens_common.idempotency import IdempotencyMiddleware


class _StubRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}

    async def get(self, key: str) -> Any:
        return self.store.get(key)

    async def set(self, key: str, value: Any, ex: int | None = None, nx: bool = False) -> None:
        self.store[key] = value if isinstance(value, str) else json.dumps(value)


async def _identity_app(scope: dict[str, Any], receive: Any, send: Any) -> None:
    body_chunks = bytearray()
    while True:
        msg = await receive()
        body_chunks.extend(msg.get("body", b""))
        if not msg.get("more_body"):
            break
    response_body = json.dumps({"echo": body_chunks.decode("utf-8") or ""}).encode("utf-8")
    await send(
        {
            "type": "http.response.start",
            "status": 201,
            "headers": [(b"content-type", b"application/json")],
        }
    )
    await send({"type": "http.response.body", "body": response_body, "more_body": False})


def _make_scope(body_bytes: bytes, idem_key: str | None = "key-1") -> tuple[dict[str, Any], list[dict[str, Any]]]:
    headers = [
        (b"content-type", b"application/json"),
        (b"content-length", str(len(body_bytes)).encode()),
    ]
    if idem_key:
        headers.append((b"idempotency-key", idem_key.encode()))
    scope = {"type": "http", "method": "POST", "path": "/v1/things", "headers": headers}
    receive_msgs = [
        {"type": "http.request", "body": body_bytes, "more_body": False},
    ]
    return scope, receive_msgs


async def _run(app: Any, scope: dict[str, Any], receive_msgs: list[dict[str, Any]]) -> tuple[int, bytes, dict[str, str]]:
    sent_start: dict[str, Any] = {}
    body = bytearray()

    async def receive() -> dict[str, Any]:
        return receive_msgs.pop(0) if receive_msgs else {"type": "http.disconnect"}

    async def send(message: dict[str, Any]) -> None:
        if message["type"] == "http.response.start":
            sent_start.update(message)
        elif message["type"] == "http.response.body":
            body.extend(message.get("body", b""))

    await app(scope, receive, send)
    headers_out = {k.decode(): v.decode() for k, v in (sent_start.get("headers") or [])}
    return int(sent_start.get("status", 0)), bytes(body), headers_out


@pytest.mark.asyncio
async def test_passthrough_when_no_idempotency_key() -> None:
    redis = _StubRedis()
    middleware = IdempotencyMiddleware(_identity_app, redis=redis)
    scope, msgs = _make_scope(b'{"x":1}', idem_key=None)
    status, body, _ = await _run(middleware, scope, msgs)
    assert status == 201
    assert json.loads(body)["echo"] == '{"x":1}'
    assert redis.store == {}


@pytest.mark.asyncio
async def test_first_request_caches_and_replays_on_repeat() -> None:
    redis = _StubRedis()
    middleware = IdempotencyMiddleware(_identity_app, redis=redis)

    scope1, msgs1 = _make_scope(b'{"x":1}', idem_key="abc")
    status1, body1, _ = await _run(middleware, scope1, msgs1)
    assert status1 == 201
    assert len(redis.store) == 1

    scope2, msgs2 = _make_scope(b'{"x":1}', idem_key="abc")
    status2, body2, _ = await _run(middleware, scope2, msgs2)
    assert status2 == 201
    assert body1 == body2


@pytest.mark.asyncio
async def test_same_key_different_body_is_409() -> None:
    redis = _StubRedis()
    middleware = IdempotencyMiddleware(_identity_app, redis=redis)

    scope1, msgs1 = _make_scope(b'{"x":1}', idem_key="dup")
    await _run(middleware, scope1, msgs1)

    scope2, msgs2 = _make_scope(b'{"x":2}', idem_key="dup")
    status, body, headers = await _run(middleware, scope2, msgs2)
    assert status == 409
    assert headers["content-type"] == "application/problem+json"
    payload = json.loads(body)
    assert payload["code"] == "IDEMPOTENCY_KEY_CONFLICT"


@pytest.mark.asyncio
async def test_non_post_request_passes_through() -> None:
    redis = _StubRedis()
    middleware = IdempotencyMiddleware(_identity_app, redis=redis)
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/v1/things",
        "headers": [(b"idempotency-key", b"unused")],
    }
    msgs = [{"type": "http.request", "body": b"", "more_body": False}]
    status, _, _ = await _run(middleware, scope, msgs)
    assert status == 201
    assert redis.store == {}
