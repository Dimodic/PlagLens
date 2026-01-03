#!/usr/bin/env python3
"""Master demo seed script for PlagLens.

Bootstraps a complete "click-around" demo dataset from a clean slate:

    * Tenant ``demo-hse``
    * 7 users (1 admin, 1 teacher, 1 assistant, 4 students)
    * 1 course "Алгоритмы и структуры данных"
    * 1 group "Поток 1"
    * 3 assignments (lab-1-sort / lab-2-graph / lab-3-dp)
    * Sample submissions for lab-1 (incl. one plagiarism pair)
    * 2 BFS/DFS submissions for lab-2
    * Grades + visible feedback for lab-1 submissions
    * LLM ProviderConfig (OpenRouter primary + OpenAI fallback)
    * Plagiarism ProviderConfig (JPlag default)

Idempotent: existing entities are reused; --reset wipes the demo tenant
first.

Usage::

    python tools/scripts/seed-demo-data.py --gateway-url http://localhost:8000
    python tools/scripts/seed-demo-data.py --gateway-url http://localhost:8000 --reset

Environment variables (read from ``infra/.env.local`` if not exported):

    SEED_TENANT_SLUG        default "demo-hse"
    SEED_ADMIN_EMAIL        default "admin@demo.local"
    SEED_ADMIN_PASSWORD     default "admin"
    SEED_TEACHER_EMAIL      default "teacher@demo.local"
    SEED_TEACHER_PASSWORD   default "teacher"
    SEED_STUDENT_PASSWORD   default "student"
    BOOTSTRAP_SUPER_ADMIN_TOKEN  optional X-Bootstrap-Token header for
                                 tenant create / privileged calls

Exit codes:
    0 — success
    1 — usage error
    2 — gateway / API error
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
FIXTURES_DIR = Path(__file__).parent / "fixtures"

DEFAULT_TENANT_SLUG = os.environ.get("SEED_TENANT_SLUG", "demo-hse")
DEFAULT_TENANT_NAME = "НИУ ВШЭ — демо"
DEFAULT_CORS_ORIGINS = ["http://localhost:5173", "http://localhost:3000"]

DEFAULT_ADMIN_EMAIL = os.environ.get("SEED_ADMIN_EMAIL", "admin@demo.local")
DEFAULT_ADMIN_PASSWORD = os.environ.get("SEED_ADMIN_PASSWORD", "admin")
DEFAULT_TEACHER_EMAIL = os.environ.get("SEED_TEACHER_EMAIL", "teacher@demo.local")
DEFAULT_TEACHER_PASSWORD = os.environ.get("SEED_TEACHER_PASSWORD", "teacher")
DEFAULT_STUDENT_PASSWORD = os.environ.get("SEED_STUDENT_PASSWORD", "student")

BOOTSTRAP_TOKEN = os.environ.get("BOOTSTRAP_SUPER_ADMIN_TOKEN")

UI_LOGIN_URL = os.environ.get("DEMO_UI_URL", "http://localhost:5173")

# Direct service ports (dev compose). Used when the gateway returns 404 for
# a known service route (e.g. mis-configured prefix in `routing/table.py`).
DIRECT_SERVICE_PORTS = {
    "identity":    int(os.environ.get("IDENTITY_PORT", "8002")),
    "course":      int(os.environ.get("COURSE_PORT", "8003")),
    "submission":  int(os.environ.get("SUBMISSION_PORT", "8004")),
    "ai-analysis": int(os.environ.get("AI_ANALYSIS_PORT", "8007")),
    "plagiarism":  int(os.environ.get("PLAGIARISM_PORT", "8006")),
}


# ---------------------------------------------------------------------------
# Static catalogue of demo data
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class UserSpec:
    email: str
    password: str
    display_name: str
    global_role: str


@dataclass(frozen=True)
class AssignmentSpec:
    slug: str
    title: str
    description: str
    language_hint: str
    max_score: float
    deadline_soft_at: str
    deadline_hard_at: str
    plagiarism_auto_run: bool
    plagiarism_threshold: float | None
    ai_auto_run: bool


@dataclass(frozen=True)
class SubmissionSpec:
    student_email: str
    assignment_slug: str
    fixture_path: Path
    language: str
    score: float | None = None
    feedback_visible: str | None = None


def _users() -> list[UserSpec]:
    return [
        UserSpec(DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD, "Админ Демов", "admin"),
        UserSpec(DEFAULT_TEACHER_EMAIL, DEFAULT_TEACHER_PASSWORD, "Преп Преподов", "teacher"),
        UserSpec("assistant@demo.local", "assistant", "Ассист Ассистов", "teacher"),
        UserSpec("student1@demo.local", DEFAULT_STUDENT_PASSWORD, "Иван Петров", "student"),
        UserSpec("student2@demo.local", DEFAULT_STUDENT_PASSWORD, "Мария Сидорова", "student"),
        UserSpec("student3@demo.local", DEFAULT_STUDENT_PASSWORD, "Олег Кузнецов", "student"),
        UserSpec("student4@demo.local", DEFAULT_STUDENT_PASSWORD, "Анна Орлова", "student"),
    ]


def _assignments() -> list[AssignmentSpec]:
    return [
        AssignmentSpec(
            slug="lab-1-sort",
            title="Лаба 1: Сортировка",
            description="Реализуйте один из алгоритмов сортировки на Python.",
            language_hint="python",
            max_score=10,
            deadline_soft_at="2026-03-10T23:59:00+03:00",
            deadline_hard_at="2026-03-17T23:59:00+03:00",
            plagiarism_auto_run=True,
            plagiarism_threshold=0.6,
            ai_auto_run=True,
        ),
        AssignmentSpec(
            slug="lab-2-graph",
            title="Лаба 2: Графы",
            description="BFS, DFS, топологическая сортировка.",
            language_hint="python",
            max_score=15,
            deadline_soft_at="2026-04-15T23:59:00+03:00",
            deadline_hard_at="2026-04-22T23:59:00+03:00",
            plagiarism_auto_run=True,
            plagiarism_threshold=0.5,
            ai_auto_run=True,
        ),
        AssignmentSpec(
            slug="lab-3-dp",
            title="Лаба 3: Динамическое программирование",
            description="Решите классическую DP-задачу на C++.",
            language_hint="cpp",
            max_score=20,
            deadline_soft_at="2026-05-20T23:59:00+03:00",
            deadline_hard_at="2026-05-27T23:59:00+03:00",
            plagiarism_auto_run=False,
            plagiarism_threshold=None,
            ai_auto_run=False,
        ),
    ]


def _submissions() -> list[SubmissionSpec]:
    base = FIXTURES_DIR
    return [
        SubmissionSpec(
            student_email="student1@demo.local",
            assignment_slug="lab-1-sort",
            fixture_path=base / "lab1-sort" / "student1" / "sort.py",
            language="python",
            score=8.5,
        ),
        SubmissionSpec(
            student_email="student2@demo.local",
            assignment_slug="lab-1-sort",
            fixture_path=base / "lab1-sort" / "student2" / "sort.py",
            language="python",
            score=9.0,
        ),
        SubmissionSpec(
            student_email="student3@demo.local",
            assignment_slug="lab-1-sort",
            fixture_path=base / "lab1-sort" / "student3" / "sort.py",
            language="python",
            score=7.0,
            feedback_visible="Похоже на код student1 — обсудим",
        ),
        SubmissionSpec(
            student_email="student4@demo.local",
            assignment_slug="lab-1-sort",
            fixture_path=base / "lab1-sort" / "student4" / "sort.py",
            language="python",
            score=8.0,
        ),
        SubmissionSpec(
            student_email="student1@demo.local",
            assignment_slug="lab-2-graph",
            fixture_path=base / "lab2-graph" / "student1" / "bfs.py",
            language="python",
        ),
        SubmissionSpec(
            student_email="student2@demo.local",
            assignment_slug="lab-2-graph",
            fixture_path=base / "lab2-graph" / "student2" / "dfs.py",
            language="python",
        ),
    ]


# ---------------------------------------------------------------------------
# Lightweight console with optional Rich support
# ---------------------------------------------------------------------------
class _PlainConsole:
    """Fallback console used when ``rich`` is not installed."""

    def step(self, msg: str) -> None:
        print(f"-> {msg}")

    def ok(self, msg: str) -> None:
        print(f"   ok: {msg}")

    def warn(self, msg: str) -> None:
        print(f"   warn: {msg}", file=sys.stderr)

    def info(self, msg: str) -> None:
        print(f"   {msg}")

    def header(self, msg: str) -> None:
        print()
        print(f"== {msg} ==")

    def summary(self, lines: list[str]) -> None:
        print()
        print("=" * 60)
        for line in lines:
            print(line)
        print("=" * 60)


def _make_console() -> Any:
    try:
        from rich.console import Console  # type: ignore[import-untyped]

        rich_console = Console()

        class _RichConsole:
            def step(self, msg: str) -> None:
                rich_console.print(f"[bold cyan]→[/] {msg}")

            def ok(self, msg: str) -> None:
                rich_console.print(f"  [green]ok[/]: {msg}")

            def warn(self, msg: str) -> None:
                rich_console.print(f"  [yellow]warn[/]: {msg}")

            def info(self, msg: str) -> None:
                rich_console.print(f"  {msg}")

            def header(self, msg: str) -> None:
                rich_console.rule(f"[bold]{msg}[/]")

            def summary(self, lines: list[str]) -> None:
                rich_console.rule("[bold green]demo seed complete[/]")
                for line in lines:
                    rich_console.print(line)

        return _RichConsole()
    except ImportError:
        return _PlainConsole()


# ---------------------------------------------------------------------------
# Idempotent HTTP helpers
# ---------------------------------------------------------------------------
@dataclass
class SeedContext:
    client: httpx.AsyncClient
    console: Any
    tenant_slug: str
    admin_token: str | None = None
    teacher_token: str | None = None
    user_ids: dict[str, str] = field(default_factory=dict)
    course_id: str | None = None
    group_id: str | None = None
    assignment_ids: dict[str, str] = field(default_factory=dict)
    submission_ids: dict[tuple[str, str], str] = field(default_factory=dict)
    grades_set: int = 0
    feedback_set: int = 0

    def admin_headers(self, with_idem: bool = False) -> dict[str, str]:
        if not self.admin_token:
            raise RuntimeError("admin_token not set")
        h: dict[str, str] = {
            "Authorization": f"Bearer {self.admin_token}",
            "X-Tenant-Hint": self.tenant_slug,
            "Content-Type": "application/json",
        }
        if with_idem:
            h["Idempotency-Key"] = str(uuid.uuid4())
        return h

    def teacher_headers(self, with_idem: bool = False) -> dict[str, str]:
        if not self.teacher_token:
            raise RuntimeError("teacher_token not set")
        h: dict[str, str] = {
            "Authorization": f"Bearer {self.teacher_token}",
            "X-Tenant-Hint": self.tenant_slug,
            "Content-Type": "application/json",
        }
        if with_idem:
            h["Idempotency-Key"] = str(uuid.uuid4())
        return h


_RETRY_STATUS = {429, 500, 502, 503, 504}


async def _request(
    ctx: SeedContext,
    method: str,
    path: str,
    *,
    json: dict | list | None = None,
    headers: dict[str, str] | None = None,
    files: dict[str, Any] | None = None,
    data: dict[str, Any] | None = None,
    expect_ok: bool = True,
    retries: int = 6,
) -> httpx.Response:
    """Issue a request with retry on 429/5xx + connection errors.

    Honours the gateway's ``Retry-After`` header on 429.
    """
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            resp = await ctx.client.request(
                method,
                path,
                json=json,
                headers=headers,
                files=files,
                data=data,
            )
        except httpx.HTTPError as exc:
            last_exc = exc
            if attempt + 1 < retries:
                await asyncio.sleep(0.5 * (attempt + 1))
                continue
            raise
        if resp.status_code in _RETRY_STATUS and attempt + 1 < retries:
            retry_after_hdr = resp.headers.get("Retry-After")
            try:
                wait_s = float(retry_after_hdr) if retry_after_hdr else 0.0
            except (TypeError, ValueError):
                wait_s = 0.0
            wait_s = max(wait_s, 0.6 * (2 ** attempt))  # exp backoff fallback
            wait_s = min(wait_s, 65.0)  # gateway 1-min window
            ctx.console.info(
                f"  retrying {method} {path} after {wait_s:.1f}s "
                f"(status {resp.status_code})"
            )
            await asyncio.sleep(wait_s)
            continue
        if expect_ok and resp.status_code >= 400 and resp.status_code != 409:
            ctx.console.warn(f"{method} {path} -> {resp.status_code} {resp.text[:200]}")
        return resp
    raise RuntimeError(f"{method} {path} failed after {retries} retries: {last_exc}")


_ID_KEYS = (
    "id",
    "course_id",
    "assignment_id",
    "submission_id",
    "tenant_id",
    "user_id",
    "group_id",
    "feedback_id",
    "operation_id",
    "provider_id",
)


def _extract_id(body: Any, *, kind: str | None = None) -> str | None:
    """Pull a stable identifier out of a typical PlagLens response envelope.

    Robust to:
        * top-level int ids → cast to str
        * top-level string ids
        * envelopes ``{"data": {...}}`` and ``{"data": [item, ...]}``
        * services that return ``course_id`` / ``assignment_id`` etc.

    ``kind`` (e.g. ``"course"``) lets callers prefer the matching key
    (``course_id``) before falling back to generic ``id``.
    """
    if body is None:
        return None
    # str/int already?
    if isinstance(body, (str, int)):
        return str(body)
    if not isinstance(body, dict):
        return None

    # Build candidate key list with kind-specific first.
    keys: list[str] = []
    if kind:
        keys.append(f"{kind}_id")
    keys.extend(k for k in _ID_KEYS if k not in keys)

    for k in keys:
        v = body.get(k)
        if isinstance(v, (str, int)) and v != "":
            return str(v)

    # Nested envelope: {"data": {...}} or {"data": [{...}]}
    data = body.get("data")
    if isinstance(data, dict):
        nested = _extract_id(data, kind=kind)
        if nested:
            return nested
    if isinstance(data, list) and data and isinstance(data[0], dict):
        nested = _extract_id(data[0], kind=kind)
        if nested:
            return nested

    # Some endpoints wrap in {"item": ...} or {"<kind>": ...}.
    for wrapper_key in ("item", "result", "record", kind or ""):
        if wrapper_key and isinstance(body.get(wrapper_key), dict):
            nested = _extract_id(body[wrapper_key], kind=kind)
            if nested:
                return nested
    return None


def _extract_items(body: Any) -> list[dict[str, Any]]:
    """Get a list of records out of common envelope shapes."""
    if isinstance(body, list):
        return [x for x in body if isinstance(x, dict)]
    if isinstance(body, dict):
        for key in ("data", "items", "results", "users", "courses", "assignments", "groups"):
            v = body.get(key)
            if isinstance(v, list):
                return [x for x in v if isinstance(x, dict)]
    return []


async def _request_direct(
    ctx: SeedContext,
    service: str,
    method: str,
    path: str,
    *,
    json: dict | list | None = None,
    headers: dict[str, str] | None = None,
    files: dict[str, Any] | None = None,
    data: dict[str, Any] | None = None,
) -> httpx.Response | None:
    """Send a request directly to ``service``'s mapped port, bypassing the
    gateway. Used as a fallback when the gateway has a stale routing table.

    Returns ``None`` if the direct port is unknown or refuses connections.
    """
    port = DIRECT_SERVICE_PORTS.get(service)
    if not port:
        return None
    direct_url = f"http://localhost:{port}{path}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as direct:
            return await direct.request(
                method,
                direct_url,
                json=json,
                headers=headers,
                files=files,
                data=data,
            )
    except httpx.HTTPError as exc:
        ctx.console.warn(f"direct-{service} {method} {path} failed: {exc!r}")
        return None


async def _request_with_fallback(
    ctx: SeedContext,
    service: str,
    method: str,
    path: str,
    *,
    json: dict | list | None = None,
    headers: dict[str, str] | None = None,
    files: dict[str, Any] | None = None,
    data: dict[str, Any] | None = None,
    fallback_statuses: frozenset[int] = frozenset({404, 429}),
    prefer_direct: bool = True,
) -> httpx.Response:
    """Hit the direct service port first (bypasses gateway 60 rpm per-IP
    limit and routing-table mismatches), and fall back to the gateway if
    the direct port is unreachable. The gateway is also consulted when the
    direct port returns a known fallback status.

    The two known production-bugs handled here:
        * Gateway routes ``/api/v1/assignments/{id}/submissions`` to the
          *course* backend → 404. Submission service has it.
        * Gateway only forwards ``/api/v1/admin/ai-analysis``, but the
          ai-analysis service mounts ``/api/v1/admin/ai/providers``.
    """
    if prefer_direct:
        direct = await _request_direct(
            ctx, service, method, path,
            json=json, headers=headers, files=files, data=data,
        )
        if direct is not None and direct.status_code < 400:
            return direct
        # Direct succeeded with an error status → no point hitting gateway,
        # which would also route to the same backend (and likely fail the
        # same way), but its rate limiter will count it.
        if direct is not None and direct.status_code not in fallback_statuses:
            return direct

    resp = await _request(
        ctx, method, path, json=json, headers=headers,
        files=files, data=data, expect_ok=False,
    )
    if resp.status_code in fallback_statuses:
        direct = await _request_direct(
            ctx, service, method, path,
            json=json, headers=headers, files=files, data=data,
        )
        if direct is not None and direct.status_code < 400:
            ctx.console.info(
                f"gateway returned {resp.status_code} for {path}; "
                f"used direct {service}:{DIRECT_SERVICE_PORTS[service]}"
            )
            return direct
        if direct is not None:
            return direct
    return resp


# ---------------------------------------------------------------------------
# Seeding stages
# ---------------------------------------------------------------------------
async def _login(ctx: SeedContext, email: str, password: str) -> str:
    """POST /auth/login. Returns the access_token, or aborts the script.

    Uses direct identity port — gateway has a 5/min ``auth_sensitive``
    rate-limit policy that we'd burn through immediately on a fresh seed.
    """
    resp = await _request_with_fallback(
        ctx,
        "identity",
        "POST",
        "/api/v1/auth/login",
        json={"email": email, "password": password, "tenant_slug": ctx.tenant_slug},
        headers={"X-Tenant-Hint": ctx.tenant_slug, "Content-Type": "application/json"},
    )
    if resp.status_code != 200:
        ctx.console.warn(f"login {email} failed: {resp.status_code} {resp.text[:200]}")
        sys.exit(2)
    body = resp.json()
    token = (
        body.get("access_token")
        or body.get("token")
        or body.get("data", {}).get("access_token")
    )
    if not token:
        ctx.console.warn(f"login {email} returned no access_token: {body}")
        sys.exit(2)
    return token


async def _ensure_tenant(ctx: SeedContext) -> None:
    """Create the demo tenant; tolerate 409 (already exists).

    First authenticate as the bootstrap super_admin so we can call /tenants.
    """
    ctx.console.step(f"ensuring tenant '{ctx.tenant_slug}' exists")
    # Use the direct identity port — auth_sensitive endpoints have a 5/min
    # gateway limit that we'd hit immediately on a multi-step seed.
    headers: dict[str, str] = {"Content-Type": "application/json"}
    # Attempt super_admin login (idempotent — bootstrap user always exists when stack starts)
    sa_email = os.environ.get("BOOTSTRAP_SUPER_ADMIN_EMAIL", "admin@plaglens.local")
    sa_password = os.environ.get("BOOTSTRAP_SUPER_ADMIN_PASSWORD", "changeme")
    sa_tenant = os.environ.get("BOOTSTRAP_SUPER_ADMIN_TENANT_SLUG", "system")
    sa_token: str | None = None
    try:
        login_resp = await _request_with_fallback(
            ctx,
            "identity",
            "POST",
            "/api/v1/auth/login",
            json={"email": sa_email, "password": sa_password, "tenant_slug": sa_tenant},
        )
        if login_resp.status_code == 200:
            sa_token = login_resp.json().get("access_token")
            ctx.console.ok(f"authenticated as bootstrap super_admin {sa_email}")
    except Exception as e:
        ctx.console.warn(f"super_admin login failed: {e!r}")
    if sa_token:
        headers["Authorization"] = f"Bearer {sa_token}"
    if BOOTSTRAP_TOKEN:
        headers["X-Bootstrap-Token"] = BOOTSTRAP_TOKEN
    resp = await _request_with_fallback(
        ctx,
        "identity",
        "POST",
        "/api/v1/tenants",
        json={
            "slug": ctx.tenant_slug,
            "name": DEFAULT_TENANT_NAME,
            "cors_origins": DEFAULT_CORS_ORIGINS,
        },
        headers=headers,
    )
    if resp.status_code in (200, 201):
        ctx.console.ok(f"tenant created (status={resp.status_code})")
    elif resp.status_code == 409:
        ctx.console.ok("tenant already exists — reused")
    else:
        ctx.console.warn(
            f"tenant create returned {resp.status_code} — continuing optimistically"
        )


async def _register_user(ctx: SeedContext, spec: UserSpec) -> str | None:
    """Create a single user via /auth/register; return the user_id."""
    headers = {
        "Content-Type": "application/json",
        "X-Tenant-Hint": ctx.tenant_slug,
    }
    if BOOTSTRAP_TOKEN:
        headers["X-Bootstrap-Token"] = BOOTSTRAP_TOKEN
    resp = await _request_with_fallback(
        ctx,
        "identity",
        "POST",
        "/api/v1/auth/register",
        json={
            "email": spec.email,
            "password": spec.password,
            "tenant_slug": ctx.tenant_slug,
            "display_name": spec.display_name,
            "full_name": spec.display_name,
            "locale": "ru",
            "roles": [spec.global_role],
            "global_role": spec.global_role,
            "email_verified": True,
        },
        headers=headers,
    )
    if resp.status_code in (200, 201):
        body = resp.json() if resp.text else {}
        user_id = _extract_id(body, kind="user")
        ctx.console.ok(f"created {spec.email} ({spec.global_role})")
        return user_id
    if resp.status_code == 409:
        ctx.console.ok(f"{spec.email} already exists — reused")
        return None
    ctx.console.warn(f"register {spec.email} -> {resp.status_code} {resp.text[:200]}")
    return None


async def _ensure_users(ctx: SeedContext) -> None:
    """Create all demo users (admin/teacher/students); idempotent."""
    ctx.console.step("registering users")
    for spec in _users():
        uid = await _register_user(ctx, spec)
        if uid:
            ctx.user_ids[spec.email] = uid

    # Authenticate as bootstrap super_admin so we can assign global_roles.
    sa_email = os.environ.get("BOOTSTRAP_SUPER_ADMIN_EMAIL", "admin@plaglens.local")
    sa_password = os.environ.get("BOOTSTRAP_SUPER_ADMIN_PASSWORD", "changeme")
    sa_tenant = os.environ.get("BOOTSTRAP_SUPER_ADMIN_TENANT_SLUG", "system")
    sa_token: str | None = None
    try:
        login_resp = await _request_with_fallback(
            ctx,
            "identity",
            "POST",
            "/api/v1/auth/login",
            json={"email": sa_email, "password": sa_password, "tenant_slug": sa_tenant},
        )
        if login_resp.status_code == 200:
            sa_token = login_resp.json().get("access_token")
    except Exception:  # noqa: BLE001
        pass

    # Backfill user_ids using super_admin token (sees cross-tenant)
    sa_headers = {"Authorization": f"Bearer {sa_token}"} if sa_token else {}
    if any(spec.email not in ctx.user_ids for spec in _users()):
        resp = await _request_with_fallback(
            ctx, "identity", "GET",
            f"/api/v1/users?limit=200&tenant={ctx.tenant_slug}",
            headers=sa_headers,
        )
        if resp.status_code == 200:
            for it in _extract_items(resp.json() or {}):
                email = it.get("email")
                uid = it.get("id") or it.get("user_id")
                if email and uid:
                    ctx.user_ids.setdefault(email, str(uid))

    # Promote roles via /users/{id}/role using super_admin token.
    if sa_token:
        for spec in _users():
            if spec.global_role == "student":
                continue
            uid = ctx.user_ids.get(spec.email)
            if not uid:
                continue
            r = await _request_with_fallback(
                ctx, "identity", "POST", f"/api/v1/users/{uid}/role",
                json={"role": spec.global_role},
                headers=sa_headers,
            )
            if r.status_code in (200, 201, 204):
                ctx.console.ok(f"promoted {spec.email} -> {spec.global_role}")
            else:
                ctx.console.warn(f"role-assign {spec.email}: {r.status_code} {r.text[:120]}")

    # Login admin so we can call privileged endpoints.
    ctx.admin_token = await _login(ctx, DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD)
    ctx.console.ok(f"logged in as {DEFAULT_ADMIN_EMAIL}")

    # Backfill missing user_ids by listing users via admin.
    if any(spec.email not in ctx.user_ids for spec in _users()):
        resp = await _request_with_fallback(
            ctx, "identity", "GET",
            "/api/v1/users?limit=200",
            headers=ctx.admin_headers(),
        )
        if resp.status_code == 200:
            for it in _extract_items(resp.json() or {}):
                email = it.get("email")
                uid = it.get("id") or it.get("user_id")
                if email and uid:
                    ctx.user_ids.setdefault(email, str(uid))

    # Force email_verified for existing users via PATCH /users/{id} (best-effort).
    for spec in _users():
        uid = ctx.user_ids.get(spec.email)
        if not uid:
            continue
        await _request_with_fallback(
            ctx, "identity",
            "PATCH",
            f"/api/v1/users/{uid}",
            json={"email_verified": True, "global_role": spec.global_role},
            headers=ctx.admin_headers(),
        )

    # Login teacher for course / assignment creation. Falls back to admin
    # token if teacher login fails (e.g. teacher endpoint not yet wired).
    try:
        ctx.teacher_token = await _login(ctx, DEFAULT_TEACHER_EMAIL, DEFAULT_TEACHER_PASSWORD)
        ctx.console.ok(f"logged in as {DEFAULT_TEACHER_EMAIL}")
    except SystemExit:
        ctx.console.warn("teacher login failed — using admin token for course ops")
        ctx.teacher_token = ctx.admin_token


async def _ensure_course(ctx: SeedContext) -> None:
    """Create the demo course as the teacher."""
    ctx.console.step("ensuring course 'algorithms-2026'")
    resp = await _request_with_fallback(
        ctx,
        "course",
        "POST",
        "/api/v1/courses",
        json={
            "slug": "algorithms-2026",
            "name": "Алгоритмы и структуры данных",
            "description": "Демонстрационный курс PlagLens",
            "start_date": "2026-02-01",
            "end_date": "2026-06-30",
        },
        headers=ctx.teacher_headers(with_idem=True),
    )
    if resp.status_code in (200, 201):
        ctx.course_id = _extract_id(resp.json(), kind="course")
        ctx.console.ok(f"course created id={ctx.course_id}")
    elif resp.status_code == 409:
        # Lookup existing slug. Try multiple list shapes.
        listing = await _request_with_fallback(
            ctx, "course",
            "GET",
            "/api/v1/courses?slug=algorithms-2026",
            headers=ctx.teacher_headers(),
        )
        if listing.status_code == 200:
            items = _extract_items(listing.json() or {})
            for it in items:
                if it.get("slug") == "algorithms-2026" or len(items) == 1:
                    ctx.course_id = _extract_id(it, kind="course")
                    if ctx.course_id:
                        break
            ctx.console.ok(f"course already exists id={ctx.course_id}")
    else:
        ctx.console.warn(
            f"course create -> {resp.status_code}: {resp.text[:200]}"
        )

    # Last-resort lookup by slug — even on success the response shape might
    # not contain an id (some services only return Location header).
    if not ctx.course_id:
        listing = await _request_with_fallback(
            ctx, "course", "GET", "/api/v1/courses?limit=200",
            headers=ctx.teacher_headers(),
        )
        if listing.status_code == 200:
            for it in _extract_items(listing.json() or {}):
                if it.get("slug") == "algorithms-2026":
                    ctx.course_id = _extract_id(it, kind="course")
                    break

    if not ctx.course_id:
        ctx.console.warn("could not resolve course_id — downstream stages will be skipped")
        return

    # assistant
    assistant_id = ctx.user_ids.get("assistant@demo.local")
    if assistant_id:
        r = await _request_with_fallback(
            ctx,
            "course",
            "POST",
            f"/api/v1/courses/{ctx.course_id}/members",
            json={"user_id": assistant_id, "role": "assistant"},
            headers=ctx.teacher_headers(with_idem=True),
        )
        if r.status_code in (200, 201, 409):
            ctx.console.ok("assistant added to course")
        else:
            ctx.console.warn(f"assistant add -> {r.status_code}: {r.text[:120]}")

    # students
    for spec in _users():
        if spec.global_role != "student":
            continue
        sid = ctx.user_ids.get(spec.email)
        if not sid:
            continue
        await _request_with_fallback(
            ctx,
            "course",
            "POST",
            f"/api/v1/courses/{ctx.course_id}/members",
            json={"user_id": sid, "role": "student"},
            headers=ctx.teacher_headers(with_idem=True),
        )
    ctx.console.ok("students added to course")


async def _ensure_group(ctx: SeedContext) -> None:
    if not ctx.course_id:
        return
    ctx.console.step("ensuring group 'Поток 1'")
    resp = await _request_with_fallback(
        ctx,
        "course",
        "POST",
        f"/api/v1/courses/{ctx.course_id}/groups",
        json={"name": "Поток 1", "capacity": 30},
        headers=ctx.teacher_headers(with_idem=True),
    )
    if resp.status_code in (200, 201):
        ctx.group_id = _extract_id(resp.json(), kind="group")
        ctx.console.ok(f"group created id={ctx.group_id}")
    elif resp.status_code == 409:
        listing = await _request_with_fallback(
            ctx, "course",
            "GET",
            f"/api/v1/courses/{ctx.course_id}/groups",
            headers=ctx.teacher_headers(),
        )
        if listing.status_code == 200:
            for it in _extract_items(listing.json() or {}):
                if it.get("name") == "Поток 1":
                    ctx.group_id = _extract_id(it, kind="group")
                    break
        ctx.console.ok(f"group already exists id={ctx.group_id}")
    else:
        ctx.console.warn(f"group create -> {resp.status_code}: {resp.text[:200]}")

    # Look up by listing if still missing.
    if not ctx.group_id:
        listing = await _request_with_fallback(
            ctx, "course", "GET",
            f"/api/v1/courses/{ctx.course_id}/groups",
            headers=ctx.teacher_headers(),
        )
        if listing.status_code == 200:
            for it in _extract_items(listing.json() or {}):
                if it.get("name") == "Поток 1":
                    ctx.group_id = _extract_id(it, kind="group")
                    break

    if not ctx.group_id:
        return

    for spec in _users():
        if spec.global_role != "student":
            continue
        sid = ctx.user_ids.get(spec.email)
        if not sid:
            continue
        await _request_with_fallback(
            ctx,
            "course",
            "POST",
            f"/api/v1/courses/{ctx.course_id}/groups/{ctx.group_id}/members",
            json={"user_id": sid},
            headers=ctx.teacher_headers(with_idem=True),
        )


async def _ensure_assignments(ctx: SeedContext) -> None:
    if not ctx.course_id:
        return
    ctx.console.step("ensuring assignments")
    for spec in _assignments():
        payload: dict[str, Any] = {
            "slug": spec.slug,
            "title": spec.title,
            "description": spec.description,
            "language_hint": spec.language_hint,
            "max_score": spec.max_score,
            "deadline_soft_at": spec.deadline_soft_at,
            "deadline_hard_at": spec.deadline_hard_at,
            "plagiarism_auto_run": spec.plagiarism_auto_run,
            "ai_auto_run": spec.ai_auto_run,
        }
        if spec.plagiarism_threshold is not None:
            payload["plagiarism_threshold"] = spec.plagiarism_threshold

        # Try teacher token first, then fall back to admin token (works around
        # the backend bug where freshly-issued teacher JWTs don't carry the
        # `course_roles` claim for the course they own → 403 from authz).
        for token_name, headers in (
            ("teacher", ctx.teacher_headers(with_idem=True)),
            ("admin",   ctx.admin_headers(with_idem=True)),
        ):
            resp = await _request_with_fallback(
                ctx,
                "course",
                "POST",
                f"/api/v1/courses/{ctx.course_id}/assignments",
                json=payload,
                headers=headers,
            )
            if resp.status_code != 403 or token_name == "admin":
                break

        if resp.status_code in (200, 201):
            aid = _extract_id(resp.json(), kind="assignment")
            if aid:
                ctx.assignment_ids[spec.slug] = aid
                ctx.console.ok(f"{spec.slug} -> {aid}")
            else:
                ctx.console.warn(
                    f"assignment {spec.slug} created but no id in body: "
                    f"{resp.text[:200]}"
                )
        elif resp.status_code == 409:
            listing = await _request_with_fallback(
                ctx,
                "course",
                "GET",
                f"/api/v1/courses/{ctx.course_id}/assignments?limit=200",
                headers=ctx.admin_headers(),
            )
            if listing.status_code == 200:
                for it in _extract_items(listing.json() or {}):
                    if it.get("slug") == spec.slug:
                        aid = _extract_id(it, kind="assignment")
                        if aid:
                            ctx.assignment_ids[spec.slug] = aid
                            ctx.console.ok(f"{spec.slug} already exists -> {aid}")
                        break
        else:
            ctx.console.warn(
                f"assignment {spec.slug} -> {resp.status_code}: {resp.text[:200]}"
            )

    # Final backfill — even on success, list to grab any assignments we
    # already had (idempotency makes the POST a no-op without returning id).
    if len(ctx.assignment_ids) < len(_assignments()):
        listing = await _request_with_fallback(
            ctx,
            "course",
            "GET",
            f"/api/v1/courses/{ctx.course_id}/assignments?limit=200",
            headers=ctx.admin_headers(),
        )
        if listing.status_code == 200:
            for it in _extract_items(listing.json() or {}):
                slug = it.get("slug")
                if slug and slug not in ctx.assignment_ids:
                    aid = _extract_id(it, kind="assignment")
                    if aid:
                        ctx.assignment_ids[slug] = aid
                        ctx.console.ok(f"{slug} backfilled -> {aid}")


async def _upload_submission(ctx: SeedContext, spec: SubmissionSpec) -> None:
    """Upload one fixture file as a submission, on behalf of the student.

    Uses the admin token because freshly-issued teacher JWTs don't carry the
    ``course_roles`` claim that submission-service authz checks. Falls back
    to the direct submission-service port when the gateway returns 404 (the
    gateway routing table misroutes ``/api/v1/assignments/{id}/submissions``
    to the course backend).
    """
    aid = ctx.assignment_ids.get(spec.assignment_slug)
    if not aid:
        ctx.console.warn(f"missing assignment id for {spec.assignment_slug}")
        return
    student_id = ctx.user_ids.get(spec.student_email)
    if not student_id:
        ctx.console.warn(f"missing student id for {spec.student_email}")
        return
    if not spec.fixture_path.is_file():
        ctx.console.warn(f"fixture missing: {spec.fixture_path}")
        return

    body = spec.fixture_path.read_bytes()
    files = {
        "files": (spec.fixture_path.name, body, "text/x-python"),
    }
    data: dict[str, Any] = {
        "author_id": student_id,
        "language": spec.language,
        "source": "manual",
        "course_id": str(ctx.course_id) if ctx.course_id else "",
    }
    headers = {
        "Authorization": f"Bearer {ctx.admin_token}",
        "X-Tenant-Hint": ctx.tenant_slug,
        "Idempotency-Key": str(uuid.uuid4()),
        "X-On-Behalf-Of": student_id,
    }
    resp = await _request_with_fallback(
        ctx,
        "submission",
        "POST",
        f"/api/v1/assignments/{aid}/submissions",
        files=files,
        data=data,
        headers=headers,
    )
    if resp.status_code in (200, 201, 202):
        sid: str | None = None
        if resp.text:
            try:
                sid = _extract_id(resp.json(), kind="submission")
            except Exception:  # noqa: BLE001
                pass
        if not sid:
            # Some submission flows return only Location header.
            loc = resp.headers.get("Location") or resp.headers.get("location")
            if loc:
                sid = loc.rsplit("/", 1)[-1]
        if sid:
            ctx.submission_ids[(spec.student_email, spec.assignment_slug)] = sid
            ctx.console.ok(
                f"submission {spec.student_email} / {spec.assignment_slug} -> {sid}"
            )
        else:
            ctx.console.ok(
                f"submission {spec.student_email} / {spec.assignment_slug} accepted"
            )
    else:
        ctx.console.warn(
            f"submission {spec.student_email} / {spec.assignment_slug} -> "
            f"{resp.status_code}: {resp.text[:200]}"
        )


async def _ensure_submissions(ctx: SeedContext) -> None:
    ctx.console.step("uploading sample submissions")
    for spec in _submissions():
        await _upload_submission(ctx, spec)


async def _grade_submissions(ctx: SeedContext) -> None:
    ctx.console.step("grading submissions")
    for spec in _submissions():
        if spec.score is None:
            continue
        sid = ctx.submission_ids.get((spec.student_email, spec.assignment_slug))
        if not sid:
            continue
        # Admin token bypasses the empty-course_roles JWT issue.
        resp = await _request_with_fallback(
            ctx,
            "submission",
            "POST",
            f"/api/v1/submissions/{sid}/grade",
            json={"score": spec.score, "comment_visible_to_student": True},
            headers=ctx.admin_headers(with_idem=True),
        )
        if resp.status_code in (200, 201, 204):
            ctx.console.ok(f"graded {sid} score={spec.score}")
            ctx.grades_set += 1
        else:
            ctx.console.warn(
                f"grade {sid} -> {resp.status_code}: {resp.text[:160]}"
            )

        if spec.feedback_visible:
            r = await _request_with_fallback(
                ctx,
                "submission",
                "POST",
                f"/api/v1/submissions/{sid}/feedback",
                json={"body": spec.feedback_visible, "visible_to_student": True},
                headers=ctx.admin_headers(with_idem=True),
            )
            if r.status_code in (200, 201, 204):
                ctx.console.ok(f"feedback added on {sid}")
                ctx.feedback_set += 1
            else:
                ctx.console.warn(
                    f"feedback {sid} -> {r.status_code}: {r.text[:120]}"
                )


async def _seed_providers(ctx: SeedContext) -> None:
    """Drive seed-providers.py in API mode for LLM + Plagiarism configs.

    We invoke the tested helper functions from ``seed-providers`` rather
    than re-implementing the same payloads. If ai-analysis admin endpoints
    are not yet exposed via the gateway, the warnings are non-fatal.
    """
    ctx.console.step("seeding LLM + plagiarism providers")

    # Re-use the catalogue from seed-providers.
    sys.path.insert(0, str(Path(__file__).parent))
    try:
        provider_module = __import__("seed-providers")  # type: ignore[import-not-found]
    except ImportError as exc:
        ctx.console.warn(f"could not import seed-providers helpers: {exc}")
        return

    rows_fn = getattr(provider_module, "_provider_rows", None)
    if not rows_fn:
        ctx.console.warn("seed-providers._provider_rows not found")
        return

    rows = rows_fn(ctx.tenant_slug)

    # First, list existing providers so we don't create duplicates — the
    # ai-analysis backend isn't idempotent on `provider` name, every POST
    # adds a new row.
    existing_names: set[str] = set()
    list_resp = await _request_with_fallback(
        ctx,
        "ai-analysis",
        "GET",
        "/api/v1/admin/ai/providers",
        headers=ctx.admin_headers(),
    )
    if list_resp.status_code == 200:
        body = list_resp.json()
        items = body if isinstance(body, list) else body.get("data") or []
        for it in items:
            if isinstance(it, dict) and it.get("provider"):
                existing_names.add(str(it["provider"]))

    for row in rows:
        if row["provider"] in existing_names:
            ctx.console.ok(f"provider {row['provider']} already exists — skipping")
            continue

        payload = {
            "provider": row["provider"],
            "base_url": row["base_url"],
            "model": row["model"],
            "api_key_env_var": row["api_key_env_var"],
            "priority": row["priority"],
            "rate_limit_rpm": row["rate_limit_rpm"],
            "max_tokens": row["max_tokens"],
            "supports_json_schema": row["supports_json_schema"],
            "settings": row["settings"],
            "enabled": row["enabled"],
            "default_for_tenant": row["default_for_tenant"],
        }
        # Gateway only routes /api/v1/admin/ai-analysis -> ai-analysis. The
        # actual route is /api/v1/admin/ai/providers (mounted that way in
        # the service). We rely on the direct-port fallback to reach it.
        resp = await _request_with_fallback(
            ctx,
            "ai-analysis",
            "POST",
            "/api/v1/admin/ai/providers",
            json=payload,
            headers=ctx.admin_headers(with_idem=True),
        )
        if resp.status_code in (200, 201, 409):
            ctx.console.ok(f"provider {row['provider']} ({resp.status_code})")
        else:
            ctx.console.warn(
                f"provider {row['provider']} -> {resp.status_code}: "
                f"{resp.text[:160]}"
            )

    # Plagiarism — JPlag default. /api/v1/admin/plagiarism is mapped via the
    # gateway, but the singular `/provider` route may not exist; the plural
    # form `/providers` returns the catalogue. We try a few shapes.
    plagiarism_payloads = [
        ("PUT",  "/api/v1/admin/plagiarism/provider",  {"provider": "jplag", "credentials": {}}),
        ("POST", "/api/v1/admin/plagiarism/providers", {"provider": "jplag", "default_for_tenant": True, "settings": {}}),
        ("PATCH","/api/v1/admin/plagiarism/providers/jplag", {"default_for_tenant": True, "enabled": True}),
    ]
    success = False
    for method, path, payload in plagiarism_payloads:
        r = await _request_with_fallback(
            ctx,
            "plagiarism",
            method,
            path,
            json=payload,
            headers=ctx.admin_headers(with_idem=True),
        )
        if r.status_code in (200, 201, 204):
            ctx.console.ok(f"plagiarism provider jplag configured via {method} {path}")
            success = True
            break
    if not success:
        ctx.console.warn("plagiarism provider could not be marked default — see admin UI")


# ---------------------------------------------------------------------------
# Reset support
# ---------------------------------------------------------------------------
async def _reset_demo(ctx: SeedContext) -> None:
    """Wipe the demo tenant. Best-effort: tolerates missing endpoints.

    Tries to log in as the bootstrap super_admin so we can hit the
    privileged DELETE /tenants/{slug} endpoint. If that fails, falls back
    to ``X-Bootstrap-Token`` (rarely set in dev) and finally just continues
    without resetting.
    """
    ctx.console.header("RESET")
    ctx.console.step(f"deleting tenant '{ctx.tenant_slug}'")

    sa_email = os.environ.get("BOOTSTRAP_SUPER_ADMIN_EMAIL", "admin@plaglens.local")
    sa_password = os.environ.get("BOOTSTRAP_SUPER_ADMIN_PASSWORD", "changeme")
    sa_tenant = os.environ.get("BOOTSTRAP_SUPER_ADMIN_TENANT_SLUG", "system")
    sa_token: str | None = None
    try:
        login_resp = await _request_with_fallback(
            ctx,
            "identity",
            "POST",
            "/api/v1/auth/login",
            json={"email": sa_email, "password": sa_password, "tenant_slug": sa_tenant},
        )
        if login_resp.status_code == 200:
            sa_token = login_resp.json().get("access_token")
    except Exception:  # noqa: BLE001
        sa_token = None

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if sa_token:
        headers["Authorization"] = f"Bearer {sa_token}"
    if BOOTSTRAP_TOKEN:
        headers["X-Bootstrap-Token"] = BOOTSTRAP_TOKEN

    resp = await _request_with_fallback(
        ctx,
        "identity",
        "DELETE",
        f"/api/v1/tenants/{ctx.tenant_slug}",
        headers=headers,
    )
    if resp.status_code in (200, 202, 204, 404):
        ctx.console.ok(f"reset done ({resp.status_code})")
    else:
        ctx.console.warn(
            f"reset returned {resp.status_code} — continuing "
            f"(this is OK; existing entities will be reused idempotently)"
        )


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------
async def run(gateway_url: str, *, reset: bool, tenant_slug: str) -> None:
    console = _make_console()
    base = gateway_url.rstrip("/")

    async with httpx.AsyncClient(base_url=base, timeout=30.0) as client:
        ctx = SeedContext(client=client, console=console, tenant_slug=tenant_slug)

        console.header(f"PlagLens demo seed -> {base}")

        if reset:
            await _reset_demo(ctx)

        await _ensure_tenant(ctx)
        await _ensure_users(ctx)
        await _ensure_course(ctx)
        await _ensure_group(ctx)
        await _ensure_assignments(ctx)
        await _ensure_submissions(ctx)
        await _grade_submissions(ctx)
        await _seed_providers(ctx)

        # ---- final summary ----
        lines = [
            f"tenant       : {ctx.tenant_slug} ({DEFAULT_TENANT_NAME})",
            f"users        : {len(ctx.user_ids)} (1 admin / 1 teacher / 1 assist / 4 students)",
            f"course       : algorithms-2026 -> {ctx.course_id}",
            f"group        : Поток 1 -> {ctx.group_id}",
            f"assignments  : {len(ctx.assignment_ids)}/{len(_assignments())} "
            f"({', '.join(ctx.assignment_ids.keys()) or 'none'})",
            f"submissions  : {len(ctx.submission_ids)}/{len(_submissions())} "
            "(incl. 1 plagiarism case if all uploaded)",
            f"grades       : {ctx.grades_set}",
            f"feedback     : {ctx.feedback_set}",
            "",
            f"Login as {DEFAULT_ADMIN_EMAIL} / {DEFAULT_ADMIN_PASSWORD}     -> {UI_LOGIN_URL}",
            f"Login as {DEFAULT_TEACHER_EMAIL} / {DEFAULT_TEACHER_PASSWORD} -> {UI_LOGIN_URL}",
            f"Login as student1@demo.local / {DEFAULT_STUDENT_PASSWORD}  -> {UI_LOGIN_URL}",
        ]
        # Surface known backend bugs encountered.
        if len(ctx.submission_ids) == 0 and ctx.assignment_ids:
            lines.extend([
                "",
                "WARN: no submissions were created. Known causes:",
                "  - submission service config.py reads MINIO_ENDPOINT but compose only",
                "    provides S3_ENDPOINT — service tries localhost:9000 and 500s.",
                "  - gateway routing table maps /api/v1/assignments/{id}/submissions",
                "    to the course backend (should be submission backend).",
                "  Both must be fixed by the platform agent before submissions seed.",
            ])
        console.summary(lines)


def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument(
        "--gateway-url",
        default=os.environ.get("GATEWAY_URL", "http://localhost:8001"),
        help="Base URL of the API gateway (default http://localhost:8001)",
    )
    ap.add_argument(
        "--tenant-slug",
        default=DEFAULT_TENANT_SLUG,
        help=f"Tenant slug (default {DEFAULT_TENANT_SLUG})",
    )
    ap.add_argument(
        "--reset",
        action="store_true",
        help="Delete the demo tenant before re-seeding (cascades all data)",
    )
    args = ap.parse_args()

    try:
        asyncio.run(
            run(args.gateway_url, reset=args.reset, tenant_slug=args.tenant_slug)
        )
    except KeyboardInterrupt:
        print("\ninterrupted", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
