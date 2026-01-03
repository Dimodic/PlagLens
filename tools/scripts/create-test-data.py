#!/usr/bin/env python3
"""Seed a tenant with a fake course, members, assignments and submissions.

Useful for manual QA, demo recordings and bootstrapping local dashboards.

    python tools/scripts/create-test-data.py \\
        --gateway http://localhost:8080 \\
        --tenant-slug acme \\
        --admin-email admin@acme.test \\
        --admin-password 'super-secret' \\
        --students 25 \\
        --assignments 4 \\
        --submissions-per-student 2
"""

from __future__ import annotations

import argparse
import random
import string
import sys
import uuid

import httpx


def _login(client: httpx.Client, tenant: str, email: str, pwd: str) -> str:
    r = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": pwd, "tenant_slug": tenant},
        headers={"X-Tenant-Hint": tenant},
    )
    if r.status_code != 200:
        print(f"[!] login failed: {r.status_code} {r.text}", file=sys.stderr)
        sys.exit(2)
    body = r.json()
    return body.get("access_token") or body.get("data", {}).get("access_token") or ""


def _rand(n: int = 6) -> str:
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=n))


def _idem(headers: dict[str, str]) -> dict[str, str]:
    return {**headers, "Idempotency-Key": str(uuid.uuid4())}


def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--gateway", default="http://localhost:8080")
    ap.add_argument("--tenant-slug", required=True)
    ap.add_argument("--admin-email", required=True)
    ap.add_argument("--admin-password", required=True)
    ap.add_argument("--students", type=int, default=10)
    ap.add_argument("--assignments", type=int, default=3)
    ap.add_argument("--submissions-per-student", type=int, default=1)
    ap.add_argument("--seed", type=int, default=None)
    args = ap.parse_args()

    if args.seed is not None:
        random.seed(args.seed)

    base = args.gateway.rstrip("/")
    with httpx.Client(base_url=base, timeout=20.0) as client:
        token = _login(client, args.tenant_slug, args.admin_email, args.admin_password)
        h = {
            "Authorization": f"Bearer {token}",
            "X-Tenant-Hint": args.tenant_slug,
            "Content-Type": "application/json",
        }

        # 1. course
        course_slug = f"demo-{_rand()}"
        r = client.post(
            "/api/v1/courses",
            headers=_idem(h),
            json={"slug": course_slug, "name": f"Demo course {course_slug}"},
        )
        r.raise_for_status()
        course_id = r.json().get("id") or r.json().get("data", {}).get("id")
        print(f"course {course_slug} id={course_id}")

        # 2. students
        student_ids: list[str] = []
        for i in range(args.students):
            email = f"stu+{_rand()}@demo.test"
            r = client.post(
                "/api/v1/auth/register",
                headers=_idem(h),
                json={
                    "email": email,
                    "password": "Password1!",
                    "tenant_slug": args.tenant_slug,
                    "full_name": f"Student {i + 1}",
                    "roles": ["student"],
                },
            )
            if r.status_code in (200, 201):
                sid = r.json().get("id") or r.json().get("data", {}).get("id")
                student_ids.append(sid)
                client.post(
                    f"/api/v1/courses/{course_id}/members",
                    headers=_idem(h),
                    json={"user_id": sid, "role": "student"},
                )
            else:
                print(f"  warn: student {email} → {r.status_code}", file=sys.stderr)
        print(f"students: {len(student_ids)}")

        # 3. assignments
        assignment_ids: list[str] = []
        for i in range(args.assignments):
            r = client.post(
                f"/api/v1/courses/{course_id}/assignments",
                headers=_idem(h),
                json={"title": f"HW-{i + 1}", "language": random.choice(["python", "java", "cpp"])},
            )
            r.raise_for_status()
            aid = r.json().get("id") or r.json().get("data", {}).get("id")
            assignment_ids.append(aid)
        print(f"assignments: {len(assignment_ids)}")

        # 4. submissions
        sub_count = 0
        for sid in student_ids:
            for aid in assignment_ids[: args.submissions_per_student]:
                files = {"file": (f"sol-{_rand()}.py", b"print('hello')\n", "text/x-python")}
                hh = {k: v for k, v in h.items() if k != "Content-Type"}
                hh["Idempotency-Key"] = str(uuid.uuid4())
                hh["X-On-Behalf-Of"] = sid  # admin uploads on behalf of student
                r = client.post(
                    f"/api/v1/assignments/{aid}/submissions",
                    headers=hh,
                    files=files,
                )
                if r.status_code in (200, 201, 202):
                    sub_count += 1
        print(f"submissions: {sub_count}")
    print("seed complete.")


if __name__ == "__main__":
    main()
