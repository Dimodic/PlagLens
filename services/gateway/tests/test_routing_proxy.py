"""Universal proxy + tenant header injection + hop-by-hop strip."""

from __future__ import annotations

import respx
from httpx import Response

from gateway_service.routing.dispatcher import resolve
from gateway_service.routing.table import match


def test_routing_table_specificity():
    r = match("/api/v1/courses/42/submissions")
    assert r is not None
    assert r.backend == "submission"
    r = match("/api/v1/courses/42")
    assert r is not None
    assert r.backend == "course"


def test_submission_subresources_go_to_owning_services():
    # AI analyses for a submission must hit ai-analysis, not submission.
    r = match("/api/v1/submissions/sub_1/ai-analyses")
    assert r is not None
    assert r.backend == "ai-analysis"
    r = match("/api/v1/submissions/sub_1/ai-analyses/latest")
    assert r is not None
    assert r.backend == "ai-analysis"
    # Suspicious-flag actions for a submission live in plagiarism service.
    r = match("/api/v1/submissions/sub_1/suspicious-flags/flag_1:dismiss")
    assert r is not None
    assert r.backend == "plagiarism"
    # Generic submission paths still route to submission service.
    r = match("/api/v1/submissions/sub_1")
    assert r is not None
    assert r.backend == "submission"


def test_resolver_returns_backend_url():
    res = resolve("/api/v1/integrations/conn_1")
    assert res is not None
    route, base = res
    assert route.backend == "integration"
    assert base.startswith("http://")


def test_unknown_path_returns_404(client, auth_headers):
    r = client.get("/api/v1/nonexistent/foo", headers=auth_headers)
    assert r.status_code == 404
    assert r.json()["code"] == "NOT_FOUND"


@respx.mock
def test_proxy_forwards_with_tenant_header(client, auth_headers):
    captured = {}

    def _spy(request):
        captured["headers"] = dict(request.headers)
        return Response(200, json={"ok": True})

    respx.get("http://course-service:8080/api/v1/courses/1").mock(side_effect=_spy)
    r = client.get(
        "/api/v1/courses/1",
        headers={**auth_headers, "Proxy-Authorization": "Basic xxx"},
    )
    assert r.status_code == 200
    h = captured["headers"]
    assert h.get("x-tenant-id") == "tnt_test"
    assert h.get("x-user-id") == "usr_1"
    assert "x-request-id" in h
    # hop-by-hop client headers must NOT be forwarded (Proxy-Authorization stripped)
    assert "proxy-authorization" not in h


@respx.mock
def test_hop_by_hop_response_headers_are_stripped(client, auth_headers):
    respx.get("http://course-service:8080/api/v1/courses").mock(
        return_value=Response(
            200,
            json={"data": []},
            headers={"Connection": "keep-alive", "Transfer-Encoding": "chunked"},
        )
    )
    r = client.get("/api/v1/courses", headers=auth_headers)
    assert r.status_code == 200
    # uvicorn/test client may echo some headers but our middleware strips
    assert r.headers.get("connection", "").lower() != "keep-alive"


@respx.mock
def test_5xx_backend_proxied_with_normalization(client, auth_headers):
    respx.get("http://course-service:8080/api/v1/courses").mock(
        return_value=Response(500, json={"message": "boom"}, headers={"Content-Type": "application/json"})
    )
    r = client.get("/api/v1/courses", headers=auth_headers)
    assert r.status_code == 500
    assert "problem+json" in r.headers["content-type"]
    body = r.json()
    assert body["status"] == 500
    assert body["code"] in {"UPSTREAM_FAILED", "INTERNAL"}
