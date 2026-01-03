"""healthz / readyz / metrics / version smoke tests."""

from __future__ import annotations


def test_healthz(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_readyz_ok_with_redis(client):
    r = client.get("/readyz")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ready"


def test_metrics_exposition(client):
    r = client.get("/metrics")
    assert r.status_code == 200
    assert "gateway_requests_total" in r.text


def test_version(client):
    r = client.get("/v1/version")
    assert r.status_code == 200
    body = r.json()
    assert body["service"] == "gateway"
    assert "version" in body


def test_request_id_header_propagated(client):
    r = client.get("/healthz", headers={"X-Request-Id": "abc12345abc12345"})
    assert r.status_code == 200
    assert r.headers["X-Request-Id"] == "abc12345abc12345"


def test_request_id_header_generated_when_invalid(client):
    r = client.get("/healthz", headers={"X-Request-Id": "!!short"})
    assert r.status_code == 200
    assert len(r.headers["X-Request-Id"]) >= 16
