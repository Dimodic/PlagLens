"""Seed the real КНАД C++ 24/25 course structure.

This is NOT fixture data — these are production rows the system would have
after a real teacher set up their course and the integration sync ran:

  • Tenant: "ФКН ВШЭ" (slug=hse-fkn)
  • Course: "Программирование на C++ КНАД 24/25" (slug=knad-cpp-24-25)
  • 3 teachers (Горденко М.К., Береснева Е.Н., Еремин А.)
  • 7 assistants (Кораблина, Покровский, Соловкин, Битюков, Дубинина, Марченкова, Масленникова)
    Note: in the data model assistants are users with `global_role='student'`
    plus a `role='assistant'` row in course.course_members. Yes, the global
    role is "student"; the per-course role is what gates teaching access.
  • 10 homeworks bound to Yandex.Contest contests 73433–73442

Students and submissions come later via the Yandex.Contest OAuth import.

Run inside the identity-service container:
    docker exec plaglens-identity python /tmp/seed_real_kn_cpp.py
"""
from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from identity_service.common.ids import tenant_id as _tenant_id, user_id as _user_id
from identity_service.common.security import hash_password
from identity_service.models import Tenant, User


TENANT_SLUG = "hse-fkn"
TENANT_NAME = "ФКН ВШЭ"

TEACHERS: list[tuple[str, str]] = [
    ("gordenko.mk@edu.hse.ru", "Горденко М.К."),
    ("beresneva.en@edu.hse.ru", "Береснева Е.Н."),
    ("eremin.a@edu.hse.ru", "Еремин А."),
]

# `global_role='student'` for assistants per the model — the per-course
# `assistant` role lives in course.course_members.
ASSISTANTS: list[tuple[str, str]] = [
    ("korablina.m@edu.hse.ru", "Кораблина Майя"),
    ("pokrovsky.a@edu.hse.ru", "Покровский Александр"),
    ("solovkin.a@edu.hse.ru", "Соловкин Александр"),
    ("bityukov.p@edu.hse.ru", "Битюков Павел"),
    ("dubinina.d@edu.hse.ru", "Дубинина Дарья"),
    ("marchenkova.a@edu.hse.ru", "Марченкова Анастасия"),
    ("maslennikova.m@edu.hse.ru", "Масленникова Мария"),
]

DEFAULT_PASSWORD = os.getenv("SEED_PASSWORD", "changeme")


async def main() -> None:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL must be set inside the container")
    engine = create_async_engine(db_url, echo=False)
    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with factory() as s:
        # 1. Tenant
        existing_t = (
            await s.execute(
                select(Tenant).where(
                    Tenant.slug == TENANT_SLUG, Tenant.deleted_at.is_(None)
                )
            )
        ).scalar_one_or_none()
        if existing_t is None:
            tenant = Tenant(
                id=_tenant_id(),
                slug=TENANT_SLUG,
                name=TENANT_NAME,
                status="active",
                settings={},
                cors_origins=[],
            )
            s.add(tenant)
            await s.flush()
            print(f"[+] tenant {TENANT_SLUG} -> {tenant.id}")
        else:
            tenant = existing_t
            print(f"[=] tenant {TENANT_SLUG} already exists -> {tenant.id}")

        # 2. Users (idempotent: skip if email already in this tenant)
        created_user_ids: dict[str, str] = {}
        roster: list[tuple[str, str, str]] = (
            [(e, n, "teacher") for e, n in TEACHERS]
            + [(e, n, "student") for e, n in ASSISTANTS]
        )
        for email, name, global_role in roster:
            existing_u = (
                await s.execute(
                    select(User).where(
                        User.tenant_id == tenant.id,
                        User.email == email,
                        User.deleted_at.is_(None),
                    )
                )
            ).scalar_one_or_none()
            if existing_u is not None:
                created_user_ids[email] = existing_u.id
                print(f"[=] user {email} already exists -> {existing_u.id}")
                continue
            u = User(
                id=_user_id(),
                tenant_id=tenant.id,
                email=email,
                email_verified_at=datetime.now(timezone.utc),
                password_hash=hash_password(DEFAULT_PASSWORD),
                display_name=name,
                locale="ru",
                timezone="Europe/Moscow",
                status="active",
                global_role=global_role,
            )
            s.add(u)
            await s.flush()
            created_user_ids[email] = u.id
            print(f"[+] user {email} -> {u.id}  (role={global_role})")

        await s.commit()
        print()
        print(f"Tenant ID: {tenant.id}")
        print("User IDs (for course-service seed):")
        for email, uid in created_user_ids.items():
            print(f"  {email} = {uid}")


if __name__ == "__main__":
    asyncio.run(main())
