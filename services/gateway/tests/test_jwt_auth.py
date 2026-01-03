"""JWT validation: valid / expired / revoked."""

from __future__ import annotations

import respx
from httpx import Response

from gateway_service.auth import REVOKE_LIST_KEY


def test_protected_route_requires_jwt(client):
    r = client.get("/api/v1/courses")
    assert r.status_code == 401
    body = r.json()
    assert body["code"] == "UNAUTHENTICATED"
    assert body["status"] == 401
    assert "request_id" in body


@respx.mock
def test_valid_jwt_forwards_to_backend(client, auth_headers):
    respx.get("http://course-service:8080/api/v1/courses").mock(
        return_value=Response(200, json={"data": []})
    )
    r = client.get("/api/v1/courses", headers=auth_headers)
    assert r.status_code == 200
    assert r.json() == {"data": []}


def test_expired_jwt_returns_401_with_token_expired_code(client, factory_make_token):
    token = factory_make_token(expired=True)
    r = client.get(
        "/api/v1/courses", headers={"Authorization": f"Bearer {token}"}
    )
    assert r.status_code == 401
    assert r.json()["code"] == "TOKEN_EXPIRED"


def test_revoked_jwt_returns_401_token_revoked(client, factory_make_token, _fake_redis):
    import asyncio

    token = factory_make_token(jti="revoked-jti-1")

    async def _seed():
        await _fake_redis.sadd(REVOKE_LIST_KEY, "revoked-jti-1")

    asyncio.run(_seed())
    r = client.get("/api/v1/courses", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401
    assert r.json()["code"] == "TOKEN_REVOKED"
