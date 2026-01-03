#!/usr/bin/env python3
"""Standalone bootstrap-super-admin script.

Creates a `super_admin` user (and the tenant if missing) against an arbitrary
PlagLens identity database. Useful for ad-hoc operations against a remote
deployment when you cannot exec into the identity container.

Usage examples
--------------
    # 1. Use the same env vars the in-container bootstrap reads.
    BOOTSTRAP_SUPER_ADMIN_EMAIL=admin@plaglens.local \\
    BOOTSTRAP_SUPER_ADMIN_PASSWORD=changeme \\
    DATABASE_URL=postgresql+asyncpg://identity_app:pwd@localhost:5432/plaglens \\
        python tools/scripts/bootstrap-super-admin.py

    # 2. Pass everything on the command line.
    python tools/scripts/bootstrap-super-admin.py \\
        --database-url postgresql+asyncpg://identity_app:pwd@localhost:5432/plaglens \\
        --email admin@plaglens.local \\
        --password 'changeme' \\
        --tenant-slug system

The script performs the same idempotent logic as the in-container module:
the tenant is created if missing, an existing super-admin is left untouched,
and an existing user with the same email is reported but never silently
re-roled.

Requirements
------------
This script requires the identity-service package to be importable (i.e. it
needs ``services/identity/src`` on PYTHONPATH or the package installed). When
run from the project root it auto-prepends the path.
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


def _patch_pythonpath() -> None:
    """Allow running this script from a checkout without `pip install`."""
    repo_root = Path(__file__).resolve().parents[2]
    identity_src = repo_root / "services" / "identity" / "src"
    if identity_src.is_dir():
        sys.path.insert(0, str(identity_src))
    libs_common = repo_root / "libs" / "plaglens-common" / "src"
    if libs_common.is_dir():
        sys.path.insert(0, str(libs_common))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Bootstrap a PlagLens super-admin (idempotent)."
    )
    parser.add_argument("--database-url", default=os.getenv("DATABASE_URL", ""),
                        help="Async SQLAlchemy DSN (e.g. postgresql+asyncpg://...)")
    parser.add_argument("--email", default=os.getenv("BOOTSTRAP_SUPER_ADMIN_EMAIL", ""))
    parser.add_argument("--password", default=os.getenv("BOOTSTRAP_SUPER_ADMIN_PASSWORD", ""))
    parser.add_argument("--tenant-slug",
                        default=os.getenv("BOOTSTRAP_SUPER_ADMIN_TENANT_SLUG", "system"))
    args = parser.parse_args()

    if not args.database_url:
        parser.error("--database-url is required (or set DATABASE_URL).")
    if not args.email or not args.password:
        parser.error("--email and --password are required (or set their env vars).")

    # Pass everything down to the in-container module via env so we share logic.
    os.environ["DATABASE_URL"] = args.database_url
    os.environ["BOOTSTRAP_SUPER_ADMIN_EMAIL"] = args.email
    os.environ["BOOTSTRAP_SUPER_ADMIN_PASSWORD"] = args.password
    os.environ["BOOTSTRAP_SUPER_ADMIN_TENANT_SLUG"] = args.tenant_slug

    _patch_pythonpath()

    # Import after patching PYTHONPATH so the identity-service package resolves.
    from identity_service.bootstrap_super_admin import main as _run  # type: ignore

    return _run()


if __name__ == "__main__":
    sys.exit(main())
