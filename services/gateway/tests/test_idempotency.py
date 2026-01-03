"""Idempotency-Key replay + body-conflict detection."""

from __future__ import annotations

import respx
from httpx import Response


@respx.mock
def test_idempotency_replay_returns_cached_response(client, auth_headers):
    call_count = {"n": 0}

    def _spy(request):
        call_count["n"] += 1
        return Response(201, json={"id": "crs_42"})

    respx.post("http://course-service:8080/api/v1/courses").mock(side_effect=_spy)

    headers = dict(auth_headers)
    headers["Idempotency-Key"] = "11111111-1111-1111-1111-111111111111"
    headers["Content-Type"] = "application/json"

    r1 = client.post("/api/v1/courses", json={"title": "A"}, headers=headers)
    r2 = client.post("/api/v1/courses", json={"title": "A"}, headers=headers)
    assert r1.status_code == 201
    assert r2.status_code == 201
    # Backend hit only once
    assert call_count["n"] == 1


@respx.mock
def test_idempotency_conflict_on_different_body(client, auth_headers):
    respx.post("http://course-service:8080/api/v1/courses").mock(
        return_value=Response(201, json={"id": "x"})
    )
    headers = dict(auth_headers)
    headers["Idempotency-Key"] = "22222222-2222-2222-2222-222222222222"
    headers["Content-Type"] = "application/json"

    r1 = client.post("/api/v1/courses", json={"title": "A"}, headers=headers)
    assert r1.status_code == 201
    r2 = client.post("/api/v1/courses", json={"title": "B"}, headers=headers)
    assert r2.status_code == 409
    assert r2.json()["code"] == "IDEMPOTENCY_KEY_CONFLICT"
