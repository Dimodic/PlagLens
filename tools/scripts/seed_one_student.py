"""Create one demo student in the КНАД C++ course.

Run inside identity-service:
    docker exec plaglens-identity python /tmp/seed_student.py
"""
from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from identity_service.common.ids import user_id as _user_id
from identity_service.common.security import hash_password
from identity_service.models import Tenant, User


TENANT_SLUG = "hse-fkn"
EMAIL = "student@plaglens.local"
NAME = "Иван Петров"


async def main() -> None:
    db_url = os.getenv("DATABASE_URL")
    engine = create_async_engine(db_url, echo=False)
    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as s:
        t = (
            await s.execute(
                select(Tenant).where(Tenant.slug == TENANT_SLUG, Tenant.deleted_at.is_(None))
            )
        ).scalar_one()
        existing = (
            await s.execute(
                select(User).where(
                    User.tenant_id == t.id, User.email == EMAIL, User.deleted_at.is_(None)
                )
            )
        ).scalar_one_or_none()
        if existing:
            print(f"[=] {EMAIL} already exists -> {existing.id}")
            return
        u = User(
            id=_user_id(),
            tenant_id=t.id,
            email=EMAIL,
            email_verified_at=datetime.now(timezone.utc),
            password_hash=hash_password("changeme"),
            display_name=NAME,
            locale="ru",
            timezone="Europe/Moscow",
            status="active",
            global_role="student",
        )
        s.add(u)
        await s.commit()
        print(f"[+] {EMAIL} -> {u.id}")


if __name__ == "__main__":
    asyncio.run(main())
