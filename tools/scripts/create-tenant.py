#!/usr/bin/env python3
"""Provision a tenant + initial admin user via the Identity API.

Example:

    python tools/scripts/create-tenant.py \\
        --gateway http://localhost:8080 \\
        --tenant-slug acme \\
        --tenant-name "ACME Corp" \\
        --admin-email admin@acme.test \\
        --admin-password 'super-secret'

Exit codes: 0 on success, 1 on usage, 2 on API failure.
"""

from __future__ import annotations

import argparse
import json
import sys

import httpx


def _post(client: httpx.Client, path: str, payload: dict, *, headers: dict | None = None) -> dict:
    r = client.post(path, json=payload, headers=headers or {})
    if r.status_code >= 400:
        print(f"[!] POST {path} → {r.status_code}\n    {r.text}", file=sys.stderr)
        sys.exit(2)
    try:
        return r.json()
    except json.JSONDecodeError:
        return {}


def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    ap.add_argument("--gateway", default="http://localhost:8080")
    ap.add_argument("--tenant-slug", required=True)
    ap.add_argument("--tenant-name", required=True)
    ap.add_argument("--admin-email", required=True)
    ap.add_argument("--admin-password", required=True)
    ap.add_argument("--admin-name", default="Tenant Admin")
    ap.add_argument(
        "--bootstrap-token",
        default=None,
        help="X-Bootstrap-Token if Identity requires one for tenant create",
    )
    args = ap.parse_args()

    base = args.gateway.rstrip("/")
    headers: dict[str, str] = {}
    if args.bootstrap_token:
        headers["X-Bootstrap-Token"] = args.bootstrap_token

    with httpx.Client(base_url=base, timeout=10.0) as client:
        print(f"→ creating tenant '{args.tenant_slug}' on {base}")
        tenant = _post(
            client,
            "/api/v1/tenants",
            {"slug": args.tenant_slug, "name": args.tenant_name},
            headers=headers,
        )
        print(f"  ok: tenant_id={tenant.get('id') or tenant.get('data', {}).get('id')}")

        print(f"→ registering admin user {args.admin_email}")
        user = _post(
            client,
            "/api/v1/auth/register",
            {
                "email": args.admin_email,
                "password": args.admin_password,
                "tenant_slug": args.tenant_slug,
                "full_name": args.admin_name,
                "roles": ["admin"],
            },
            headers={**headers, "X-Tenant-Hint": args.tenant_slug},
        )
        print(f"  ok: user_id={user.get('id') or user.get('data', {}).get('id')}")

    print("done.")


if __name__ == "__main__":
    main()
