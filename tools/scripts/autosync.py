"""PlagLens autosync — runs `import-participants` for every active
Yandex.Contest integration in PlagLens.

Designed to be invoked by cron / Windows Task Scheduler / docker-compose
sidecar with APScheduler. Stateful via the integration's own cursor (we just
re-call the same endpoint — backend is idempotent), so safe to run as often
as you like.

Usage
-----
Set environment variables and run:

    PLAGLENS_BASE_URL=http://localhost:5173 \\
    PLAGLENS_ADMIN_EMAIL=admin@plaglens.local \\
    PLAGLENS_ADMIN_PASSWORD=changeme \\
    python tools/scripts/autosync.py

Cron example (every 5 minutes):

    */5 * * * * cd /path/to/PlagLens && python tools/scripts/autosync.py >> /var/log/plaglens-autosync.log 2>&1

Windows Task Scheduler — same thing, point at the script.

What it does
------------
1. Logs in as admin via /api/v1/auth/login.
2. Lists every active integration of kind=yandex_contest.
3. For each, lists the bound course's homeworks and extracts contest_id from
   the description (PlagLens convention: ``contest_id=NNNNN``).
4. POSTs ``/integrations/yandex-contest/{cfg}/contests/{id}/import-participants``
   for each contest. The endpoint is idempotent (existing users skipped).
5. POSTs ``/import-submissions`` similarly — counts only for now.
6. Prints a summary line; exit 0 unless a fatal error.
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from typing import Any
from urllib import request as urlreq, error as urlerr


BASE = os.getenv("PLAGLENS_BASE_URL", "http://localhost:5173").rstrip("/")
EMAIL = os.getenv("PLAGLENS_ADMIN_EMAIL", "admin@plaglens.local")
PASSWORD = os.getenv("PLAGLENS_ADMIN_PASSWORD", "changeme")
TIMEOUT = float(os.getenv("PLAGLENS_HTTP_TIMEOUT", "60"))

CONTEST_ID_RE = re.compile(r"contest_id\s*=\s*(\d+)", re.I)


def _request(
    method: str,
    path: str,
    *,
    token: str | None = None,
    body: Any = None,
) -> tuple[int, Any]:
    url = f"{BASE}{path}"
    data = None
    headers = {"Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urlreq.Request(url, data=data, headers=headers, method=method)
    try:
        with urlreq.urlopen(req, timeout=TIMEOUT) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else None
    except urlerr.HTTPError as exc:
        raw = exc.read()
        try:
            payload = json.loads(raw) if raw else None
        except json.JSONDecodeError:
            payload = raw.decode("utf-8", errors="replace")
        return exc.code, payload


def login() -> str:
    status, payload = _request(
        "POST",
        "/api/v1/auth/login",
        body={"email": EMAIL, "password": PASSWORD},
    )
    if status >= 400 or not payload:
        raise SystemExit(f"login failed ({status}): {payload}")
    token = payload.get("access_token")
    if not token:
        raise SystemExit(f"no access_token in login response: {payload}")
    return token


def list_integrations(token: str) -> list[dict[str, Any]]:
    status, payload = _request(
        "GET",
        "/api/v1/integrations?limit=200",
        token=token,
    )
    if status >= 400:
        raise SystemExit(f"list integrations failed ({status}): {payload}")
    return [
        c
        for c in (payload.get("data") or [])
        if c.get("kind") == "yandex_contest" and c.get("status") == "active"
    ]


def list_homeworks(token: str, course_id: str) -> list[dict[str, Any]]:
    status, payload = _request(
        "GET",
        f"/api/v1/courses/{course_id}/homeworks?limit=200",
        token=token,
    )
    if status >= 400:
        print(f"  ! homeworks fetch failed ({status}): {payload}")
        return []
    return payload.get("data") or []


def import_participants(token: str, cfg_id: str, contest_id: int) -> dict[str, Any]:
    status, payload = _request(
        "POST",
        f"/api/v1/integrations/yandex-contest/{cfg_id}/contests/{contest_id}/import-participants",
        token=token,
    )
    return {"status": status, "payload": payload}


def import_submissions(token: str, cfg_id: str, contest_id: int) -> dict[str, Any]:
    status, payload = _request(
        "POST",
        f"/api/v1/integrations/yandex-contest/{cfg_id}/contests/{contest_id}/import-submissions",
        token=token,
    )
    return {"status": status, "payload": payload}


def main() -> int:
    started = time.monotonic()
    print(f"[autosync] start @ {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"[autosync] base={BASE} email={EMAIL}")
    token = login()
    print("[autosync] logged in OK")

    integrations = list_integrations(token)
    if not integrations:
        print("[autosync] no active yandex_contest integrations — nothing to do.")
        return 0
    print(f"[autosync] {len(integrations)} active YC integration(s)")

    total_pp = 0
    total_subs = 0
    for cfg in integrations:
        cfg_id = cfg["id"]
        course_id = cfg.get("course_id")
        print(f"  • cfg={cfg_id} course={course_id}")
        homeworks = list_homeworks(token, course_id) if course_id else []
        contest_ids: list[int] = []
        for hw in homeworks:
            m = CONTEST_ID_RE.search(hw.get("description") or "")
            if m:
                contest_ids.append(int(m.group(1)))
        if not contest_ids:
            print("    (no homework with contest_id — skip)")
            continue

        for cid in contest_ids:
            pres = import_participants(token, cfg_id, cid)
            payload = pres["payload"] if isinstance(pres["payload"], dict) else {}
            imported = payload.get("imported", 0)
            identity = payload.get("identity") or {}
            course = payload.get("course") or {}
            total_pp += imported
            print(
                f"    contest {cid}: participants={imported}"
                f" (created={identity.get('created', 0)},"
                f" existing={identity.get('existing', 0)},"
                f" enrolled={course.get('added', 0)})"
            )
            sres = import_submissions(token, cfg_id, cid)
            spayload = sres["payload"] if isinstance(sres["payload"], dict) else {}
            fetched = spayload.get("fetched", 0)
            total_subs += fetched
            if fetched:
                print(f"    contest {cid}: submissions fetched={fetched}")

    elapsed = time.monotonic() - started
    print(
        f"[autosync] done in {elapsed:.1f}s — total participants={total_pp},"
        f" submissions={total_subs}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
