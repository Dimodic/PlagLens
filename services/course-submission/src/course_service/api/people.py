"""Profile data hosted by course-service: the courses a person belongs to.

Consumed by the gateway's ``/profiles/{id}`` aggregator. Course membership
(names/slugs/role) is treated as non-sensitive directory data — any
authenticated viewer may read it, cross-tenant (matches the product's
"find anyone, see which courses they're in" decision)."""
from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select

from ..models import Course, CourseMember, CourseOwner
from ._helpers import SessionDep, UserDep

router = APIRouter(prefix="/api/v1/people", tags=["people"])


@router.get("/{user_id}/courses")
async def person_courses(
    user_id: str,
    user: UserDep,
    session: SessionDep,
) -> dict:
    """All courses the person owns or is a member of (owner role wins on
    overlap). Ordered by name. Not tenant-filtered — a person belongs to
    one tenant and their course list is part of the public profile."""
    owner_rows = (
        await session.execute(
            select(Course, CourseOwner.role)
            .join(CourseOwner, CourseOwner.course_id == Course.id)
            .where(CourseOwner.user_id == user_id, Course.deleted_at.is_(None))
        )
    ).all()
    member_rows = (
        await session.execute(
            select(Course, CourseMember.role)
            .join(CourseMember, CourseMember.course_id == Course.id)
            .where(
                CourseMember.user_id == user_id,
                CourseMember.removed_at.is_(None),
                Course.deleted_at.is_(None),
            )
        )
    ).all()
    by_id: dict[int, dict] = {}
    for c, role in owner_rows:
        by_id[c.id] = {
            "id": str(c.id),
            "name": c.name,
            "slug": c.slug,
            "role": role,
        }
    for c, role in member_rows:
        by_id.setdefault(
            c.id,
            {"id": str(c.id), "name": c.name, "slug": c.slug, "role": role},
        )
    items = sorted(by_id.values(), key=lambda x: (x["name"] or "").lower())
    return {"data": items}


__all__ = ["router"]
