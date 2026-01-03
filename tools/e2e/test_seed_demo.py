"""End-to-end test for ``tools/scripts/seed-demo-data.py``.

The test runs the seeder against a fully mocked gateway built with
``respx``. This is an offline contract test: it does NOT require any
PlagLens services to be running. It verifies that:

    1. The script issues every required API call (tenant create, register,
       login, course / assignment / submission / grade / provider).
    2. After the run completes, "the gateway" can answer admin queries
       confirming the expected entity counts (7 users, 1 tenant, 1 course,
       3 assignments).

The mock fixtures live entirely inside this file so the test is
self-contained and easy to review.
"""

from __future__ import annotations

import asyncio
import importlib.util
import json
import sys
import uuid
from collections import Counter
from pathlib import Path
from typing import Any

import httpx
import pytest

pytestmark = pytest.mark.smoke


# This test file is fully offline (uses httpx.MockTransport). Override the
# session-scoped autouse `_gateway_reachable` fixture from conftest.py so we
# don't get skipped when no real gateway is running.
@pytest.fixture(scope="session", autouse=True)
def _gateway_reachable() -> None:
    return None


SCRIPT_PATH = (
    Path(__file__).resolve().parent.parent / "scripts" / "seed-demo-data.py"
)
TENANT_SLUG = "demo-hse"
GATEWAY = "http://gateway.test"


# ---------------------------------------------------------------------------
# Helper: import the hyphenated script as a module for in-process invocation
# ---------------------------------------------------------------------------
def _load_seed_module() -> Any:
    spec = importlib.util.spec_from_file_location("seed_demo_data", SCRIPT_PATH)
    if not spec or not spec.loader:  # pragma: no cover — defensive
        pytest.skip(f"could not load seeder from {SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules["seed_demo_data"] = module
    spec.loader.exec_module(module)
    return module


# ---------------------------------------------------------------------------
# In-memory fake state shared across mocked routes
# ---------------------------------------------------------------------------
class _FakeBackend:
    """Tiny stub of the gateway used by the seed script."""

    def __init__(self) -> None:
        self.users: dict[str, dict[str, Any]] = {}
        self.tenant_created = False
        self.course: dict[str, Any] | None = None
        self.group: dict[str, Any] | None = None
        self.members: list[dict[str, Any]] = []
        self.assignments: dict[str, dict[str, Any]] = {}
        self.submissions: dict[str, dict[str, Any]] = {}
        self.grades: dict[str, dict[str, Any]] = {}
        self.feedback: list[dict[str, Any]] = []
        self.providers: list[dict[str, Any]] = []
        self.plagiarism_provider: dict[str, Any] | None = None
        self.requests: Counter[str] = Counter()


# ---------------------------------------------------------------------------
# httpx MockTransport — implements the minimal API surface the seeder uses
# ---------------------------------------------------------------------------
def _build_transport(state: _FakeBackend) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        method = request.method
        state.requests[f"{method} {path}"] += 1

        # ---- tenants ----
        if method == "POST" and path == "/api/v1/tenants":
            if state.tenant_created:
                return httpx.Response(409, json={"error": "exists"})
            state.tenant_created = True
            return httpx.Response(
                201, json={"id": "tnt_demo", "slug": TENANT_SLUG}
            )

        if method == "DELETE" and path.startswith("/api/v1/tenants/"):
            # Wipe data but keep `state.requests` so assertions can detect
            # the DELETE call after a full re-seed.
            saved_requests = state.requests
            state.__init__()  # type: ignore[misc]
            state.requests = saved_requests
            return httpx.Response(204)

        # ---- auth ----
        if method == "POST" and path == "/api/v1/auth/register":
            body = json.loads(request.content.decode() or "{}")
            email = body["email"]
            if email in state.users:
                return httpx.Response(409, json={"error": "exists"})
            uid = f"usr_{uuid.uuid4().hex[:8]}"
            state.users[email] = {
                "id": uid,
                "email": email,
                "global_role": body.get("global_role")
                or (body.get("roles") or ["student"])[0],
                "display_name": body.get("display_name") or body.get("full_name", ""),
                "email_verified": True,
            }
            return httpx.Response(201, json={"id": uid, "email": email})

        if method == "POST" and path == "/api/v1/auth/login":
            body = json.loads(request.content.decode() or "{}")
            email = body["email"]
            if email not in state.users:
                return httpx.Response(401, json={"error": "no such user"})
            return httpx.Response(
                200,
                json={
                    "access_token": f"fake-token-{state.users[email]['id']}",
                    "expires_in": 900,
                    "user": state.users[email],
                },
            )

        # ---- users ----
        if method == "GET" and path.startswith("/api/v1/users"):
            items = list(state.users.values())
            return httpx.Response(200, json={"items": items})

        if method == "PATCH" and path.startswith("/api/v1/users/"):
            return httpx.Response(204)

        # ---- courses ----
        if method == "POST" and path == "/api/v1/courses":
            body = json.loads(request.content.decode() or "{}")
            if state.course:
                return httpx.Response(409, json={"error": "exists"})
            state.course = {
                "id": f"crs_{uuid.uuid4().hex[:8]}",
                "slug": body["slug"],
                "name": body["name"],
            }
            return httpx.Response(201, json=state.course)

        if method == "GET" and path == "/api/v1/courses":
            items = [state.course] if state.course else []
            return httpx.Response(200, json={"items": items})

        if method == "POST" and "/members" in path and "/groups/" not in path:
            body = json.loads(request.content.decode() or "{}")
            state.members.append(body)
            return httpx.Response(201, json={"ok": True})

        # ---- groups ----
        if method == "POST" and path.endswith("/groups"):
            body = json.loads(request.content.decode() or "{}")
            if state.group:
                return httpx.Response(409, json={"error": "exists"})
            state.group = {
                "id": f"grp_{uuid.uuid4().hex[:8]}",
                "name": body["name"],
            }
            return httpx.Response(201, json=state.group)

        if method == "GET" and path.endswith("/groups"):
            items = [state.group] if state.group else []
            return httpx.Response(200, json={"items": items})

        if method == "POST" and "/groups/" in path and path.endswith("/members"):
            return httpx.Response(201, json={"ok": True})

        # ---- assignments ----
        if method == "POST" and path.endswith("/assignments"):
            body = json.loads(request.content.decode() or "{}")
            slug = body["slug"]
            if slug in state.assignments:
                return httpx.Response(409, json={"error": "exists"})
            asg = {
                "id": f"asg_{uuid.uuid4().hex[:8]}",
                "slug": slug,
                "title": body.get("title", ""),
            }
            state.assignments[slug] = asg
            return httpx.Response(201, json=asg)

        if method == "GET" and path.endswith("/assignments"):
            return httpx.Response(
                200, json={"items": list(state.assignments.values())}
            )

        # ---- submissions (multipart) ----
        if method == "POST" and "/submissions" in path and path.endswith(
            "/submissions"
        ):
            sid = f"sub_{uuid.uuid4().hex[:8]}"
            state.submissions[sid] = {"id": sid, "path": path}
            return httpx.Response(201, json={"id": sid})

        # ---- grade & feedback ----
        if method == "POST" and path.endswith("/grade"):
            body = json.loads(request.content.decode() or "{}")
            sid = path.split("/")[-2]
            state.grades[sid] = body
            return httpx.Response(201, json={"ok": True})

        if method == "POST" and path.endswith("/feedback"):
            body = json.loads(request.content.decode() or "{}")
            state.feedback.append(body)
            return httpx.Response(201, json={"ok": True})

        # ---- providers ----
        if method == "POST" and path == "/api/v1/admin/ai/providers":
            body = json.loads(request.content.decode() or "{}")
            state.providers.append(body)
            return httpx.Response(
                201, json={"id": f"pcf_{uuid.uuid4().hex[:8]}", **body}
            )

        if method == "PUT" and path == "/api/v1/admin/plagiarism/provider":
            body = json.loads(request.content.decode() or "{}")
            state.plagiarism_provider = body
            return httpx.Response(204)

        # default
        return httpx.Response(404, json={"path": path, "method": method})

    return httpx.MockTransport(handler)


# ---------------------------------------------------------------------------
# Test
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_seed_demo_data_creates_full_dataset(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Drive seed-demo-data.py against a mocked gateway and assert results."""
    state = _FakeBackend()
    transport = _build_transport(state)

    seed = _load_seed_module()

    # Patch httpx.AsyncClient inside the seeder so that *every* HTTP call
    # is dispatched to our MockTransport.
    real_async_client = httpx.AsyncClient

    def _patched_client(*args: Any, **kwargs: Any) -> httpx.AsyncClient:
        kwargs["transport"] = transport
        return real_async_client(*args, **kwargs)

    monkeypatch.setattr(seed.httpx, "AsyncClient", _patched_client)

    # Run the seeder.
    await seed.run(GATEWAY, reset=False, tenant_slug=TENANT_SLUG)

    # ---- assertions ----
    assert state.tenant_created, "tenant must be created"
    assert len(state.users) == 7, (
        f"expected 7 users, got {len(state.users)}: {list(state.users)}"
    )
    expected_emails = {
        "admin@demo.local",
        "teacher@demo.local",
        "assistant@demo.local",
        "student1@demo.local",
        "student2@demo.local",
        "student3@demo.local",
        "student4@demo.local",
    }
    assert set(state.users) == expected_emails

    role_counts = Counter(u["global_role"] for u in state.users.values())
    assert role_counts["admin"] == 1
    assert role_counts["teacher"] == 2  # teacher + assistant (both global=teacher)
    assert role_counts["student"] == 4

    assert state.course is not None
    assert state.course["slug"] == "algorithms-2026"

    assert state.group is not None
    assert state.group["name"] == "Поток 1"

    assert set(state.assignments) == {"lab-1-sort", "lab-2-graph", "lab-3-dp"}

    # 4 lab-1 + 2 lab-2 = 6 submissions expected
    assert len(state.submissions) == 6, list(state.submissions)

    # All four lab-1 students get grades, one gets visible feedback
    assert len(state.grades) == 4
    assert any("Похоже" in (fb.get("body") or "") for fb in state.feedback)

    # Providers: OpenRouter + OpenAI (2 LLM rows) + JPlag plagiarism
    provider_names = {p["provider"] for p in state.providers}
    assert "openrouter-gpt-4o-mini" in provider_names
    assert "openai-gpt-4o-mini" in provider_names
    assert state.plagiarism_provider is not None
    assert state.plagiarism_provider["provider"] == "jplag"


@pytest.mark.asyncio
async def test_seed_demo_data_reset_wipes_first(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """--reset issues a DELETE before re-seeding."""
    state = _FakeBackend()
    state.tenant_created = True  # pre-existing demo tenant
    transport = _build_transport(state)

    seed = _load_seed_module()

    real_async_client = httpx.AsyncClient

    def _patched_client(*args: Any, **kwargs: Any) -> httpx.AsyncClient:
        kwargs["transport"] = transport
        return real_async_client(*args, **kwargs)

    monkeypatch.setattr(seed.httpx, "AsyncClient", _patched_client)

    await seed.run(GATEWAY, reset=True, tenant_slug=TENANT_SLUG)

    # The DELETE must have been issued.
    delete_calls = [k for k in state.requests if k.startswith("DELETE ")]
    assert any("/api/v1/tenants/" in k for k in delete_calls), state.requests


def test_module_compiles() -> None:
    """Smoke check that the script is at least syntactically valid."""
    import py_compile

    py_compile.compile(str(SCRIPT_PATH), doraise=True)


def test_fixtures_exist() -> None:
    """All fixture files referenced by the seeder must be present."""
    fixtures_dir = SCRIPT_PATH.parent / "fixtures"
    expected = [
        "lab1-sort/student1/sort.py",
        "lab1-sort/student2/sort.py",
        "lab1-sort/student3/sort.py",
        "lab1-sort/student4/sort.py",
        "lab2-graph/student1/bfs.py",
        "lab2-graph/student2/dfs.py",
    ]
    for rel in expected:
        path = fixtures_dir / rel
        assert path.is_file(), f"missing fixture: {path}"


def test_run_returns_coroutine() -> None:
    """The async entrypoint must be awaitable (sanity)."""
    seed = _load_seed_module()
    coro = seed.run(GATEWAY, reset=False, tenant_slug=TENANT_SLUG)
    assert asyncio.iscoroutine(coro)
    coro.close()
