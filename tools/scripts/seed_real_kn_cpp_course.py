"""Seed the КНАД C++ 24/25 course on the course-service side.

Companion to seed_real_kn_cpp.py — that one created the tenant + users in
identity-service. This one reads them back via cross-schema query and
creates:

  • Course (slug=knad-cpp-24-25)
  • Course owners: Горденко (owner) + Береснева, Еремин (co_owner)
  • Course members: 7 assistants
  • 10 homeworks bound to Yandex.Contest contests 73433..73442 with the
    real deadlines from wiki.cs.hse.ru (16.01.24 — 21.03.24)

Run inside the course-service container:
    docker exec plaglens-course python /tmp/seed_course.py
"""
from __future__ import annotations

import asyncio
import json
import os
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from course_service.models import Course, CourseMember, CourseOwner, Homework

TENANT_SLUG = "hse-fkn"
COURSE_SLUG = "knad-cpp-24-25"
COURSE_NAME = "Программирование на C++ КНАД 24/25"
COURSE_DESC = (
    "Лектор: Горденко М.К. Группы КНАД241, КНАД242, ВСН. "
    "10 контестов на Yandex.Contest (ID 73433–73442)."
)

# (email, role_in_course) for everyone who teaches/helps in the course.
# Owner is the first one; the other teachers are co-owners; assistants are
# course_members with role=assistant.
ROSTER: list[tuple[str, str]] = [
    ("gordenko.mk@edu.hse.ru", "owner"),
    ("beresneva.en@edu.hse.ru", "co_owner"),
    ("eremin.a@edu.hse.ru", "co_owner"),
    ("korablina.m@edu.hse.ru", "assistant"),
    ("pokrovsky.a@edu.hse.ru", "assistant"),
    ("solovkin.a@edu.hse.ru", "assistant"),
    ("bityukov.p@edu.hse.ru", "assistant"),
    ("dubinina.d@edu.hse.ru", "assistant"),
    ("marchenkova.a@edu.hse.ru", "assistant"),
    ("maslennikova.m@edu.hse.ru", "assistant"),
]

# (position, slug, title, due_iso, yc_contest_id)
# Deadlines are from the КНАД C++ wiki page; ДЗ 5 was 14.02.25 there
# (likely a typo for 14.02.24 since the rest of the column is Jan–Feb 2024,
# matching the spring semester). ДЗ 8–10 (contests 73440–73442) are
# extrapolated by the same weekly cadence; ДЗ 10 is the демо КР.
HOMEWORKS: list[tuple[int, str, str, datetime, int]] = [
    (1, "knad-cpp-1", "Контест 1", datetime(2024, 1, 16, 23, 59, 59, tzinfo=timezone.utc), 73433),
    (2, "knad-cpp-2", "Контест 2", datetime(2024, 1, 23, 23, 59, 59, tzinfo=timezone.utc), 73434),
    (3, "knad-cpp-3", "Контест 3", datetime(2024, 2, 2, 23, 59, 59, tzinfo=timezone.utc), 73435),
    (4, "knad-cpp-4", "Контест 4", datetime(2024, 2, 7, 23, 59, 59, tzinfo=timezone.utc), 73436),
    (5, "knad-cpp-5", "Контест 5", datetime(2024, 2, 14, 23, 59, 59, tzinfo=timezone.utc), 73437),
    (6, "knad-cpp-6", "Контест 6", datetime(2024, 2, 23, 23, 59, 0, tzinfo=timezone.utc), 73438),
    (7, "knad-cpp-7", "Контест 7", datetime(2024, 2, 28, 23, 59, 59, tzinfo=timezone.utc), 73439),
    (8, "knad-cpp-8", "Контест 8", datetime(2024, 3, 7, 23, 59, 59, tzinfo=timezone.utc), 73440),
    (9, "knad-cpp-9 (демо КР)", "Контест 9 (демо КР)", datetime(2024, 3, 14, 23, 59, 59, tzinfo=timezone.utc), 73441),
    (10, "knad-cpp-10", "Контест 10", datetime(2024, 3, 21, 23, 59, 59, tzinfo=timezone.utc), 73442),
]


async def main() -> None:
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL must be set inside the container")
    engine = create_async_engine(db_url, echo=False)
    factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Tenant + user IDs come from environment because course-service has no
    # privilege on the `identity` schema (proper SaaS isolation). The caller
    # extracts them via psql/admin and exports TENANT_ID + USERS_JSON before
    # running this script.
    tenant_id = os.getenv("TENANT_ID")
    users_json = os.getenv("USERS_JSON")
    if not tenant_id or not users_json:
        raise SystemExit(
            "TENANT_ID and USERS_JSON env vars must be set (extract from identity.tenants/users)"
        )
    user_ids: dict[str, str] = json.loads(users_json)
    for email, _ in ROSTER:
        if email not in user_ids:
            raise SystemExit(f"user {email} missing from USERS_JSON")
    print(f"[+] tenant {TENANT_SLUG} -> {tenant_id}")

    async with factory() as s:

        owner_email = ROSTER[0][0]
        owner_uid = user_ids[owner_email]

        # Course (idempotent on (tenant_id, slug))
        existing_c = (
            await s.execute(
                select(Course).where(
                    Course.tenant_id == tenant_id,
                    Course.slug == COURSE_SLUG,
                    Course.deleted_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if existing_c is not None:
            course = existing_c
            print(f"[=] course {COURSE_SLUG} already exists -> id={course.id}")
        else:
            course = Course(
                tenant_id=tenant_id,
                slug=COURSE_SLUG,
                name=COURSE_NAME,
                description=COURSE_DESC,
                status="active",
                owner_id=owner_uid,
                settings={},
            )
            s.add(course)
            await s.flush()
            print(f"[+] course {COURSE_SLUG} -> id={course.id}")

        # Owners + members
        for email, role in ROSTER:
            uid = user_ids[email]
            if role in ("owner", "co_owner"):
                existing_o = (
                    await s.execute(
                        select(CourseOwner).where(
                            CourseOwner.course_id == course.id,
                            CourseOwner.user_id == uid,
                        )
                    )
                ).scalar_one_or_none()
                if existing_o is None:
                    s.add(CourseOwner(course_id=course.id, user_id=uid, role=role))
                    print(f"  [+] owner {email} ({role})")
                else:
                    print(f"  [=] owner {email} already")
            else:
                existing_m = (
                    await s.execute(
                        select(CourseMember).where(
                            CourseMember.course_id == course.id,
                            CourseMember.user_id == uid,
                            CourseMember.removed_at.is_(None),
                        )
                    )
                ).scalar_one_or_none()
                if existing_m is None:
                    s.add(CourseMember(course_id=course.id, user_id=uid, role=role))
                    print(f"  [+] member {email} ({role})")
                else:
                    print(f"  [=] member {email} already")

        # Homeworks
        for position, slug, title, due_at, yc_id in HOMEWORKS:
            existing_h = (
                await s.execute(
                    select(Homework).where(
                        Homework.course_id == course.id,
                        Homework.slug == slug,
                        Homework.deleted_at.is_(None),
                    )
                )
            ).scalar_one_or_none()
            if existing_h is not None:
                print(f"  [=] hw {slug} already")
                continue
            hw = Homework(
                course_id=course.id,
                slug=slug,
                title=title,
                description=f"Yandex.Contest contest_id={yc_id}",
                position=position,
                status="published",
                due_at=due_at,
            )
            s.add(hw)
            print(f"  [+] hw {slug} -> due {due_at.date()} (yc_contest={yc_id})")

        await s.commit()
        print()
        print(f"Done. Course id = {course.id}, tenant = {tenant_id}")


if __name__ == "__main__":
    asyncio.run(main())
