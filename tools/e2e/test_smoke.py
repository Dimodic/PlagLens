"""Smoke tests for a running PlagLens stack.

Each test is best-effort: if the gateway routes are not implemented yet, we
emit `pytest.skip` rather than failing — the suite is meant to grow with
"""

from __future__ import annotations

import json
import uuid

import httpx
import pytest

pytestmark = pytest.mark.asyncio

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _ok_or_skip(resp: httpx.Response, *expected: int) -> None:
    """Skip when the route 404s (not yet implemented), otherwise assert."""
    if resp.status_code == 404:
        pytest.skip(f"{resp.request.method} {resp.request.url.path} not implemented yet")
    assert resp.status_code in expected, (
        f"{resp.request.method} {resp.request.url.path} → {resp.status_code}: {resp.text[:200]}"
    )

# ---------------------------------------------------------------------------
# 1. Per-service /healthz and /readyz (10 services, via gateway aggregation)
# ---------------------------------------------------------------------------
async def test_gateway_healthz(http_client: httpx.AsyncClient) -> None:
    r = await http_client.get("/healthz")
    assert r.status_code == 200, r.text

async def test_gateway_readyz(http_client: httpx.AsyncClient) -> None:
    r = await http_client.get("/readyz")
    # 200 ready, 503 not-ready but reachable — both are acceptable signals
    assert r.status_code in (200, 503), r.text

async def test_aggregated_health_v1(http_client: httpx.AsyncClient) -> None:
    """Gateway exposes /v1/health which aggregates all backends."""
    r = await http_client.get("/api/v1/health")
    if r.status_code == 404:
        pytest.skip("/api/v1/health aggregator not implemented yet")
    assert r.status_code in (200, 503), r.text
    body = r.json()
    assert "status" in body or "services" in body, f"unexpected body: {body}"

@pytest.mark.parametrize(
    "service",
    [
        "identity",
        "course",
        "submission",
        "integration",
        "plagiarism",
        "ai-analysis",
        "notification",
        "reporting",
        "audit",
    ],
)
async def test_per_service_status_through_aggregator(
    http_client: httpx.AsyncClient, service: str
) -> None:
    """Verify each backend appears in the aggregated /v1/health response."""
    r = await http_client.get("/api/v1/health")
    if r.status_code == 404:
        pytest.skip("/api/v1/health aggregator not implemented yet")
    assert r.status_code in (200, 503)
    body = r.json()
    services = body.get("services") or body.get("backends") or {}
    if not services:
        pytest.skip("aggregator response has no per-service breakdown yet")
    # Tolerate either dict or list shape.
    if isinstance(services, dict):
        keys = set(services.keys())
    else:
        keys = {s.get("name") for s in services if isinstance(s, dict)}
    assert service in keys, f"{service} missing from aggregated health: {keys}"

# ---------------------------------------------------------------------------
# 2. JWKS — public keys used to verify access tokens
# ---------------------------------------------------------------------------
async def test_jwks_endpoint(http_client: httpx.AsyncClient) -> None:
    r = await http_client.get("/api/v1/.well-known/jwks.json")
    if r.status_code == 404:
        pytest.skip("JWKS not yet implemented")
    assert r.status_code == 200, r.text
    body = r.json()
    assert "keys" in body and isinstance(body["keys"], list), body
    if body["keys"]:
        first = body["keys"][0]
        # Either RSA (RS256) or symmetric (HS256 in dev) — accept both.
        assert "kty" in first
        if first.get("kty") == "RSA":
            assert "n" in first and "e" in first

# ---------------------------------------------------------------------------
# 3. Auth — protected routes refuse unauthenticated requests
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/courses",
        "/api/v1/users/me",
        "/api/v1/submissions",
        "/api/v1/notifications",
    ],
)
async def test_protected_endpoint_requires_auth(http_client: httpx.AsyncClient, path: str) -> None:
    r = await http_client.get(path)
    if r.status_code == 404:
        pytest.skip(f"{path} not implemented yet")
    assert r.status_code == 401, f"{path} returned {r.status_code} for unauth call"

async def test_cross_tenant_access_denied(
    http_client: httpx.AsyncClient, auth_headers: dict[str, str]
) -> None:
    """Same JWT, different X-Tenant-Hint → expect 403 TENANT_MISMATCH."""
    headers = dict(auth_headers)
    headers["X-Tenant-Hint"] = "other-tenant-does-not-belong"
    r = await http_client.get("/api/v1/users/me", headers=headers)
    if r.status_code == 404:
        pytest.skip("/users/me not implemented yet")
    # 401 also acceptable: gateway may reject before tenant check.
    assert r.status_code in (401, 403), r.text

# ---------------------------------------------------------------------------
# 4. End-to-end happy path — register → login → course → assignment →
#    submission → operation status. Skipped (not failed) if any step is
# ---------------------------------------------------------------------------
async def test_simulated_user_flow(
    http_client: httpx.AsyncClient, auth_headers: dict[str, str]
) -> None:
    idem = lambda: {"Idempotency-Key": str(uuid.uuid4())}  # noqa: E731

    # Tenant + user are bootstrapped in the auth_headers fixture.

    # 4.1 — create course
    r = await http_client.post(
        "/api/v1/courses",
        headers={**auth_headers, **idem()},
        content=json.dumps({"name": "E2E Course", "slug": f"e2e-{uuid.uuid4().hex[:6]}"}),
    )
    _ok_or_skip(r, 200, 201)
    course_id = r.json().get("id") or r.json().get("data", {}).get("id")
    assert course_id, r.json()

    # 4.2 — create assignment
    r = await http_client.post(
        f"/api/v1/courses/{course_id}/assignments",
        headers={**auth_headers, **idem()},
        content=json.dumps({"title": "E2E HW", "language": "python"}),
    )
    _ok_or_skip(r, 200, 201)
    assignment_id = r.json().get("id") or r.json().get("data", {}).get("id")
    assert assignment_id, r.json()

    # 4.3 — upload submission
    files = {"file": ("solution.py", b"print('hi')\n", "text/x-python")}
    r = await http_client.post(
        f"/api/v1/assignments/{assignment_id}/submissions",
        headers={
            "Authorization": auth_headers["Authorization"],
            "X-Tenant-Hint": auth_headers["X-Tenant-Hint"],
            "Idempotency-Key": str(uuid.uuid4()),
        },
        files=files,
    )
    _ok_or_skip(r, 200, 201, 202)
    body = r.json()

    # 4.4 — async path: poll the operation status if a Location was returned.
    op_path = r.headers.get("Location") or body.get("status_url") or body.get("operation_id")
    if not op_path:
        return  # synchronous service — flow done.
    if not op_path.startswith("/"):
        op_path = f"/api/v1/operations/{op_path}"
    op = await http_client.get(op_path, headers=auth_headers)
    _ok_or_skip(op, 200)
    op_body = op.json()
    assert op_body.get("status") in {"queued", "running", "completed", "failed", "cancelled"}, (
        op_body
    )
