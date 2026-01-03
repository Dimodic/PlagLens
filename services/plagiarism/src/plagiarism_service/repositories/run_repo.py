"""Repository for ``PlagiarismRun`` and its sub-resources (clusters)."""
from __future__ import annotations

from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.plagiarism import PlagiarismCluster, PlagiarismRun


class RunRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, run: PlagiarismRun) -> PlagiarismRun:
        self.session.add(run)
        await self.session.flush()
        return run

    async def get(self, run_id: str) -> PlagiarismRun | None:
        return await self.session.get(PlagiarismRun, run_id)

    async def get_for_tenant(self, run_id: str, tenant_id: str) -> PlagiarismRun | None:
        run = await self.session.get(PlagiarismRun, run_id)
        if run is None or run.tenant_id != tenant_id or run.deleted_at is not None:
            return None
        return run

    async def list_by_assignment(
        self,
        *,
        tenant_id: str,
        assignment_id: str,
        limit: int = 50,
        cursor_id: str | None = None,
    ) -> list[PlagiarismRun]:
        stmt = (
            select(PlagiarismRun)
            .where(
                PlagiarismRun.tenant_id == tenant_id,
                PlagiarismRun.assignment_id == assignment_id,
                PlagiarismRun.deleted_at.is_(None),
            )
            .order_by(PlagiarismRun.created_at.desc(), PlagiarismRun.id)
            .limit(limit + 1)
        )
        if cursor_id:
            stmt = stmt.where(PlagiarismRun.id < cursor_id)
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def list_by_course(
        self,
        *,
        tenant_id: str,
        course_id: str,
        limit: int = 50,
        cursor_id: str | None = None,
    ) -> list[PlagiarismRun]:
        stmt = (
            select(PlagiarismRun)
            .where(
                PlagiarismRun.tenant_id == tenant_id,
                PlagiarismRun.course_id == course_id,
                PlagiarismRun.deleted_at.is_(None),
            )
            .order_by(PlagiarismRun.created_at.desc(), PlagiarismRun.id)
            .limit(limit + 1)
        )
        if cursor_id:
            stmt = stmt.where(PlagiarismRun.id < cursor_id)
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def find_pending_idempotent(
        self,
        *,
        tenant_id: str,
        assignment_id: str | None,
        scope_hash: str,
        options_hash: str,
    ) -> PlagiarismRun | None:
        stmt = (
            select(PlagiarismRun)
            .where(
                PlagiarismRun.tenant_id == tenant_id,
                PlagiarismRun.assignment_id == assignment_id,
                PlagiarismRun.scope_hash == scope_hash,
                PlagiarismRun.options_hash == options_hash,
                PlagiarismRun.status.in_(("queued", "running")),
                PlagiarismRun.deleted_at.is_(None),
            )
            .order_by(PlagiarismRun.created_at.desc())
            .limit(1)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def find_completed_idempotent(
        self,
        *,
        tenant_id: str,
        assignment_id: str | None,
        scope_hash: str,
        options_hash: str,
    ) -> PlagiarismRun | None:
        """Reuse a previously-completed run when the request's scope and
        options match it exactly. Backs the "не перепроверять, если
        ничего не поменялось" idempotency rule — adding a new submission
        changes ``submission_ids`` → scope_hash differs → cache miss →
        a fresh run kicks off. Unchanged scope → return the existing
        completed row, no new work."""
        stmt = (
            select(PlagiarismRun)
            .where(
                PlagiarismRun.tenant_id == tenant_id,
                PlagiarismRun.assignment_id == assignment_id,
                PlagiarismRun.scope_hash == scope_hash,
                PlagiarismRun.options_hash == options_hash,
                PlagiarismRun.status == "completed",
                PlagiarismRun.deleted_at.is_(None),
            )
            .order_by(PlagiarismRun.created_at.desc())
            .limit(1)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def active(self, limit: int = 100) -> list[PlagiarismRun]:
        stmt = (
            select(PlagiarismRun)
            .where(
                PlagiarismRun.status.in_(("queued", "running")),
                PlagiarismRun.deleted_at.is_(None),
            )
            .order_by(PlagiarismRun.created_at.asc())
            .limit(limit)
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def update(self, run_id: str, **fields: Any) -> PlagiarismRun | None:
        run = await self.session.get(PlagiarismRun, run_id)
        if run is None:
            return None
        for k, v in fields.items():
            setattr(run, k, v)
        await self.session.flush()
        return run

    async def soft_delete(self, run_id: str) -> bool:
        run = await self.session.get(PlagiarismRun, run_id)
        if run is None or run.deleted_at is not None:
            return False
        run.deleted_at = datetime.now(UTC)
        await self.session.flush()
        return True

    # ---------------- clusters ----------------
    async def add_clusters(self, clusters: Sequence[PlagiarismCluster]) -> None:
        for c in clusters:
            self.session.add(c)
        await self.session.flush()

    async def list_clusters(self, run_id: str) -> list[PlagiarismCluster]:
        stmt = select(PlagiarismCluster).where(PlagiarismCluster.run_id == run_id)
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def get_cluster(self, cluster_id: str) -> PlagiarismCluster | None:
        return await self.session.get(PlagiarismCluster, cluster_id)
