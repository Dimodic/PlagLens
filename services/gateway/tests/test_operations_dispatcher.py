"""/v1/operations dispatcher — prefix routing + cancel + list fan-out."""

from __future__ import annotations

import respx
from httpx import Response

from gateway_service.operations.dispatcher import (
    all_operation_backends,
    backend_for,
    backend_url_for,
)


def test_prefix_routing_table():
    assert backend_for("op_imp_abc") == "integration"
    assert backend_for("op_plg_abc") == "plagiarism"
    assert backend_for("op_ai_abc") == "ai-analysis"
    assert backend_for("op_exp_abc") == "reporting"
    assert backend_for("op_grd_abc") == "submission"
    assert backend_for("op_unknown_x") is None


def test_backend_url_for_returns_url():
    res = backend_url_for("op_plg_abc")
    assert res is not None
    name, url = res
    assert name == "plagiarism"
    assert url.startswith("http://")


@respx.mock
def test_get_operation_dispatches_to_backend(client, auth_headers):
    respx.get(
        "http://plagiarism-service:8080/api/v1/operations/op_plg_test"
    ).mock(return_value=Response(200, json={"id": "op_plg_test", "status": "running"}))

    r = client.get("/v1/operations/op_plg_test", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["id"] == "op_plg_test"


@respx.mock
def test_cancel_operation_dispatches(client, auth_headers):
    respx.post(
        "http://reporting-service:8080/api/v1/operations/op_exp_test:cancel"
    ).mock(return_value=Response(202, json={"status": "cancelling"}))

    r = client.post("/v1/operations/op_exp_test:cancel", headers=auth_headers)
    assert r.status_code == 202


def test_get_unknown_op_id_returns_404(client, auth_headers):
    r = client.get("/v1/operations/op_xxx_unknown", headers=auth_headers)
    assert r.status_code == 404
    assert r.json()["code"] == "NOT_FOUND"


@respx.mock
def test_list_operations_fans_out_and_merges(client, auth_headers):
    for _, base in all_operation_backends():
        respx.get(base.rstrip("/") + "/api/v1/operations").mock(
            return_value=Response(200, json={"data": [{"id": f"op_{base[-10:]}"}]})
        )
    r = client.get("/v1/operations", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert "data" in body
    # We expect at least one entry per healthy backend.
    assert len(body["data"]) >= 1
