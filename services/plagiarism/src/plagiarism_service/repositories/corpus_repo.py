"""Repository for ``CorpusEntry`` (cross-course corpus)."""
from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.plagiarism import CorpusEntry


class CorpusRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def upsert(
        self,
        *,
        entry_id: str,
        tenant_id: str,
        course_id: str | None,
        assignment_id: str | None,
        submission_id: str,
        language: str | None,
        fingerprints: bytes,
        token_count: int,
    ) -> CorpusEntry:
        existing = await self._get_by_submission(submission_id)
        if existing is not None:
            existing.tenant_id = tenant_id
            existing.course_id = course_id
            existing.assignment_id = assignment_id
            existing.language = language
            existing.fingerprints = fingerprints
            existing.token_count = token_count
            existing.deleted_at = None
            await self.session.flush()
            return existing
        entry = CorpusEntry(
            id=entry_id,
            tenant_id=tenant_id,
            course_id=course_id,
            assignment_id=assignment_id,
            submission_id=submission_id,
            language=language,
            fingerprints=fingerprints,
            token_count=token_count,
        )
        self.session.add(entry)
        await self.session.flush()
        return entry

    async def _get_by_submission(self, submission_id: str) -> CorpusEntry | None:
        stmt = select(CorpusEntry).where(CorpusEntry.submission_id == submission_id).limit(1)
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def get(self, entry_id: str) -> CorpusEntry | None:
        return await self.session.get(CorpusEntry, entry_id)

    async def list_for_tenant(
        self,
        *,
        tenant_id: str,
        language: str | None = None,
        course_id: str | None = None,
        limit: int = 200,
        offset: int = 0,
    ) -> list[CorpusEntry]:
        stmt = (
            select(CorpusEntry)
            .where(
                CorpusEntry.tenant_id == tenant_id,
                CorpusEntry.deleted_at.is_(None),
            )
            .order_by(CorpusEntry.added_at.desc())
            .limit(limit)
            .offset(offset)
        )
        if language is not None:
            stmt = stmt.where(CorpusEntry.language == language)
        if course_id is not None:
            stmt = stmt.where(CorpusEntry.course_id == course_id)
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def soft_delete_by_submission(self, submission_id: str) -> bool:
        entry = await self._get_by_submission(submission_id)
        if entry is None or entry.deleted_at is not None:
            return False
        entry.deleted_at = datetime.now(UTC)
        await self.session.flush()
        return True

    async def soft_delete(self, entry_id: str) -> bool:
        entry = await self.session.get(CorpusEntry, entry_id)
        if entry is None or entry.deleted_at is not None:
            return False
        entry.deleted_at = datetime.now(UTC)
        await self.session.flush()
        return True

    async def stats(self, tenant_id: str) -> tuple[int, dict[str, int], dict[str, int], datetime | None]:
        total_stmt = select(func.count()).select_from(CorpusEntry).where(
            CorpusEntry.tenant_id == tenant_id,
            CorpusEntry.deleted_at.is_(None),
        )
        total = (await self.session.execute(total_stmt)).scalar_one() or 0

        lang_stmt = (
            select(CorpusEntry.language, func.count())
            .where(
                CorpusEntry.tenant_id == tenant_id,
                CorpusEntry.deleted_at.is_(None),
            )
            .group_by(CorpusEntry.language)
        )
        by_language = {
            (row[0] or "unknown"): int(row[1])
            for row in (await self.session.execute(lang_stmt)).all()
        }

        course_stmt = (
            select(CorpusEntry.course_id, func.count())
            .where(
                CorpusEntry.tenant_id == tenant_id,
                CorpusEntry.deleted_at.is_(None),
            )
            .group_by(CorpusEntry.course_id)
        )
        by_course = {
            (row[0] or "unknown"): int(row[1])
            for row in (await self.session.execute(course_stmt)).all()
        }

        last_stmt = (
            select(func.max(CorpusEntry.added_at))
            .where(
                CorpusEntry.tenant_id == tenant_id,
                CorpusEntry.deleted_at.is_(None),
            )
        )
        last_added = (await self.session.execute(last_stmt)).scalar_one()
        return total, by_language, by_course, last_added
