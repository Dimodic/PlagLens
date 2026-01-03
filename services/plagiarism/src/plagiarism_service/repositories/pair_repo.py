"""Repository for ``PlagiarismPair``."""
from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.plagiarism import PlagiarismPair


class PairRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add_many(self, pairs: Sequence[PlagiarismPair]) -> None:
        for p in pairs:
            self.session.add(p)
        await self.session.flush()

    async def list_by_run(
        self,
        *,
        run_id: str,
        tenant_id: str,
        limit: int = 50,
        cursor_id: str | None = None,
        min_similarity: float | None = None,
        cross_course: bool | None = None,
        sort: str | None = None,
    ) -> list[PlagiarismPair]:
        stmt = select(PlagiarismPair).where(
            PlagiarismPair.run_id == run_id,
            PlagiarismPair.tenant_id == tenant_id,
        )
        if min_similarity is not None:
            stmt = stmt.where(PlagiarismPair.similarity >= min_similarity)
        if cross_course is not None:
            stmt = stmt.where(PlagiarismPair.cross_course == cross_course)
        # sort
        if sort == "-similarity":
            stmt = stmt.order_by(PlagiarismPair.similarity.desc(), PlagiarismPair.id)
        elif sort == "similarity":
            stmt = stmt.order_by(PlagiarismPair.similarity.asc(), PlagiarismPair.id)
        else:
            stmt = stmt.order_by(PlagiarismPair.similarity.desc(), PlagiarismPair.id)
        if cursor_id:
            stmt = stmt.where(PlagiarismPair.id > cursor_id)
        stmt = stmt.limit(limit + 1)
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def get(self, pair_id: str) -> PlagiarismPair | None:
        return await self.session.get(PlagiarismPair, pair_id)

    async def list_by_submission(
        self,
        *,
        submission_id: str,
        tenant_id: str,
        limit: int = 50,
    ) -> list[PlagiarismPair]:
        stmt = (
            select(PlagiarismPair)
            .where(
                PlagiarismPair.tenant_id == tenant_id,
                or_(
                    PlagiarismPair.a_submission_id == submission_id,
                    PlagiarismPair.b_submission_id == submission_id,
                ),
            )
            .order_by(PlagiarismPair.similarity.desc())
            .limit(limit)
        )
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def latest_for_submission(
        self, *, submission_id: str, tenant_id: str
    ) -> PlagiarismPair | None:
        stmt = (
            select(PlagiarismPair)
            .where(
                PlagiarismPair.tenant_id == tenant_id,
                or_(
                    PlagiarismPair.a_submission_id == submission_id,
                    PlagiarismPair.b_submission_id == submission_id,
                ),
            )
            .order_by(PlagiarismPair.created_at.desc())
            .limit(1)
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()
