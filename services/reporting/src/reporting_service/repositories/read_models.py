"""Read-models repository: dashboards-friendly accessors."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.reporting import (
    AssignmentStats,
    CourseStats,
    ReadModelHealth,
    TenantStats,
    UserGradesSummary,
)


class ReadModelRepo:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def course(self, course_id: str) -> CourseStats | None:
        return await self.session.get(CourseStats, course_id)

    async def assignment(self, assignment_id: str) -> AssignmentStats | None:
        return await self.session.get(AssignmentStats, assignment_id)

    async def tenant(self, tenant_id: str) -> TenantStats | None:
        return await self.session.get(TenantStats, tenant_id)

    async def user_grades(self, user_id: str, course_id: str) -> UserGradesSummary | None:
        return await self.session.get(UserGradesSummary, (user_id, course_id))

    async def assignments_for_course(self, course_id: str) -> list[AssignmentStats]:
        stmt = select(AssignmentStats).where(AssignmentStats.course_id == course_id)
        return list((await self.session.execute(stmt)).scalars().all())

    async def courses_for_tenant(self, tenant_id: str) -> list[CourseStats]:
        stmt = select(CourseStats).where(CourseStats.tenant_id == tenant_id)
        return list((await self.session.execute(stmt)).scalars().all())

    async def courses_for_user(self, user_id: str) -> list[UserGradesSummary]:
        stmt = select(UserGradesSummary).where(UserGradesSummary.user_id == user_id)
        return list((await self.session.execute(stmt)).scalars().all())

    async def health(self) -> list[ReadModelHealth]:
        stmt = select(ReadModelHealth)
        return list((await self.session.execute(stmt)).scalars().all())

    async def upsert_health(self, name: str, lag_seconds: float) -> None:
        existing = await self.session.get(ReadModelHealth, name)
        from ..common.time import utcnow

        if existing is None:
            self.session.add(
                ReadModelHealth(name=name, lag_seconds=lag_seconds, last_processed_at=utcnow())
            )
        else:
            existing.lag_seconds = lag_seconds
            existing.last_processed_at = utcnow()
        await self.session.flush()

    async def reset_all(self, tenant_id: str | None = None) -> int:
        """Truncate all read-model tables (optionally tenant-scoped)."""
        from sqlalchemy import delete

        deleted = 0
        for model in (UserGradesSummary, AssignmentStats, CourseStats, TenantStats):
            stmt = delete(model)
            if tenant_id and hasattr(model, "tenant_id"):
                stmt = stmt.where(model.tenant_id == tenant_id)
            elif tenant_id and model is TenantStats:
                stmt = stmt.where(model.tenant_id == tenant_id)
            r = await self.session.execute(stmt)
            deleted += r.rowcount or 0
        return deleted

    async def reset_one(self, name: str, tenant_id: str | None = None) -> int:
        from sqlalchemy import delete

        mapping = {
            "course_stats": CourseStats,
            "assignment_stats": AssignmentStats,
            "tenant_stats": TenantStats,
            "user_grades_summary": UserGradesSummary,
        }
        model = mapping.get(name)
        if model is None:
            return 0
        stmt = delete(model)
        if tenant_id and hasattr(model, "tenant_id"):
            stmt = stmt.where(model.tenant_id == tenant_id)
        r = await self.session.execute(stmt)
        return r.rowcount or 0
