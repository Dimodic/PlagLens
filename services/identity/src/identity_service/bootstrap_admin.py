"""Bootstrap a system admin if missing.

Run as a module from inside the identity-service container::

    python -m identity_service.bootstrap_admin

Behaviour
---------
* Reads ``BOOTSTRAP_ADMIN_EMAIL``, ``BOOTSTRAP_ADMIN_PASSWORD`` and
  optional ``BOOTSTRAP_ADMIN_TENANT_SLUG`` (default ``system``) from the
  environment.
* Uses the service's own async engine (``DATABASE_URL``) and ORM models so the
  password is hashed with the project's argon2 settings.
* Creates the system tenant if missing.
* Creates the admin user if no admin exists for that tenant. The user has
  ``global_role='admin'`` (``admin`` is the single cross-tenant top role — the
  "system" tenant + admin role is the platform top), the
  ``email_verified_at=now()``, and the configured password.
* Idempotent — if an admin already exists for the tenant the script logs a
  message and exits 0 without raising.
"""
from __future__ import annotations

import asyncio
import logging
import os
import sys
from datetime import datetime, timezone

from sqlalchemy import select

from .common.ids import tenant_id as _tenant_id
from .common.ids import user_id as _user_id
from .common.security import hash_password
from .db import get_session_factory
from .models import Tenant, User

logger = logging.getLogger("identity_service.bootstrap_admin")
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))


async def _bootstrap() -> int:
    email = os.getenv("BOOTSTRAP_ADMIN_EMAIL", "").strip().lower()
    password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "")
    tenant_slug = os.getenv("BOOTSTRAP_ADMIN_TENANT_SLUG", "system").strip().lower()

    if not email or not password:
        logger.info(
            "BOOTSTRAP_ADMIN_EMAIL or BOOTSTRAP_ADMIN_PASSWORD "
            "not set — nothing to do."
        )
        return 0

    factory = get_session_factory()
    async with factory() as session:
        # 1. Ensure tenant exists.
        stmt = select(Tenant).where(
            Tenant.slug == tenant_slug, Tenant.deleted_at.is_(None)
        )
        tenant: Tenant | None = (await session.execute(stmt)).scalar_one_or_none()
        if tenant is None:
            tenant = Tenant(
                id=_tenant_id(),
                slug=tenant_slug,
                name="System",
                status="active",
                settings={},
                cors_origins=[],
            )
            session.add(tenant)
            await session.flush()
            logger.info("Created tenant slug=%s id=%s", tenant_slug, tenant.id)
        else:
            logger.info("Tenant slug=%s already exists (id=%s)", tenant_slug, tenant.id)

        # 2. Skip if an admin already exists for this tenant.
        existing_stmt = select(User).where(
            User.tenant_id == tenant.id,
            User.global_role == "admin",
            User.deleted_at.is_(None),
        )
        existing = (await session.execute(existing_stmt)).scalar_one_or_none()
        if existing is not None:
            logger.info(
                "admin already exists for tenant=%s (user_id=%s) — skipping.",
                tenant_slug,
                existing.id,
            )
            await session.commit()
            return 0

        # 3. Skip-but-promote if a user with that email already exists.
        same_email = (
            await session.execute(
                select(User).where(
                    User.tenant_id == tenant.id,
                    User.email == email,
                    User.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if same_email is not None:
            logger.warning(
                "User %s already exists in tenant=%s with role=%s — leaving role "
                "untouched. Promote manually if needed.",
                email,
                tenant_slug,
                same_email.global_role,
            )
            await session.commit()
            return 0

        # 4. Create the admin.
        user = User(
            id=_user_id(),
            tenant_id=tenant.id,
            email=email,
            email_verified_at=datetime.now(timezone.utc),
            password_hash=hash_password(password),
            display_name="Admin",
            locale="ru",
            timezone="UTC",
            status="active",
            global_role="admin",
        )
        session.add(user)
        await session.commit()
        logger.info(
            "Bootstrapped admin user=%s tenant=%s id=%s",
            email,
            tenant_slug,
            user.id,
        )
        return 0


def main() -> int:
    try:
        return asyncio.run(_bootstrap())
    except Exception as exc:  # pragma: no cover - logged & swallowed for entrypoint
        logger.exception("bootstrap_admin failed: %s", exc)
        return 1


if __name__ == "__main__":
    sys.exit(main())
