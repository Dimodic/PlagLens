"""Suspicious flag service (E10).

Auto-flagging rule:
- For every pair where ``similarity > assignment.plagiarism_threshold``
  (defaults to ``run.options.similarity_threshold``), add a flag for **both**
  submissions.
- Severity bands (per spec):
    < 0.7   → low
    [0.7, 0.85] → medium
    > 0.85  → high
"""
from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..common.ids import flag_id
from ..config import settings
from ..models.plagiarism import PlagiarismPair, SuspiciousFlag
from ..repositories.suspicious_repo import SuspiciousRepository


def severity_for(similarity: float) -> str:
    if similarity > settings.suspicious_severity_high:
        return "high"
    if similarity >= settings.suspicious_severity_medium:
        return "medium"
    return "low"


class SuspiciousService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.repo = SuspiciousRepository(session)

    async def auto_flag_pair(
        self,
        *,
        tenant_id: str,
        run_id: str,
        pair: PlagiarismPair,
        threshold: float,
    ) -> list[SuspiciousFlag]:
        if pair.similarity < threshold:
            return []
        sev = severity_for(pair.similarity)
        flags: list[SuspiciousFlag] = []
        for sub_id, peer in (
            (pair.a_submission_id, pair.b_submission_id),
            (pair.b_submission_id, pair.a_submission_id),
        ):
            f = SuspiciousFlag(
                id=flag_id(),
                tenant_id=tenant_id,
                submission_id=sub_id,
                run_id=run_id,
                reason="similarity_above_threshold",
                severity=sev,
                similarity=pair.similarity,
                paired_with=[peer],
            )
            await self.repo.add(f)
            flags.append(f)
        return flags

    async def auto_flag_pairs(
        self,
        *,
        tenant_id: str,
        run_id: str,
        pairs: Iterable[PlagiarismPair],
        threshold: float,
    ) -> tuple[int, int]:
        """Returns ``(flags_created, suspected_pair_count)``."""
        created = 0
        suspect_pairs = 0
        for p in pairs:
            if p.similarity < threshold:
                continue
            suspect_pairs += 1
            new_flags = await self.auto_flag_pair(
                tenant_id=tenant_id, run_id=run_id, pair=p, threshold=threshold
            )
            created += len(new_flags)
        return created, suspect_pairs

    async def manual_create(
        self,
        *,
        tenant_id: str,
        submission_id: str,
        reason: str,
        severity: str = "low",
        created_by: str | None,
        similarity: float | None = None,
        paired_with: list[str] | None = None,
    ) -> SuspiciousFlag:
        flag = SuspiciousFlag(
            id=flag_id(),
            tenant_id=tenant_id,
            submission_id=submission_id,
            run_id=None,
            reason=reason or "manual",
            severity=severity,
            similarity=similarity,
            paired_with=paired_with or [],
            created_by=created_by,
        )
        return await self.repo.add(flag)

    async def list_for_submission(
        self, *, submission_id: str, tenant_id: str
    ) -> list[SuspiciousFlag]:
        return await self.repo.list_for_submission(
            submission_id=submission_id, tenant_id=tenant_id
        )

    async def list_active(self, tenant_id: str) -> list[SuspiciousFlag]:
        return await self.repo.list_active(tenant_id=tenant_id)

    async def author_names_for_submissions(
        self, tenant_id: str, submission_ids: list[str]
    ) -> dict[str, tuple[str | None, str | None]]:
        """Map ``submission_id → (author_id, display_name)`` from the
        plagiarism pairs, which captured the author ФИО at scan time. This is
        the reliable source for Yandex.Contest-imported authors: they have no
        platform account and their submission payload carries no name, but the
        pair row does (``a_author_display_name`` / ``b_author_display_name``)."""
        ids = [s for s in submission_ids if s]
        if not ids:
            return {}
        stmt = select(PlagiarismPair).where(
            PlagiarismPair.tenant_id == tenant_id,
            or_(
                PlagiarismPair.a_submission_id.in_(ids),
                PlagiarismPair.b_submission_id.in_(ids),
            ),
        )
        rows = (await self.session.execute(stmt)).scalars().all()
        want = set(ids)
        out: dict[str, tuple[str | None, str | None]] = {}
        for p in rows:
            if (
                p.a_submission_id in want
                and p.a_author_display_name
                and p.a_submission_id not in out
            ):
                out[p.a_submission_id] = (p.a_author_id, p.a_author_display_name)
            if (
                p.b_submission_id in want
                and p.b_author_display_name
                and p.b_submission_id not in out
            ):
                out[p.b_submission_id] = (p.b_author_id, p.b_author_display_name)
        return out

    async def list_active_for_assignment(
        self, *, tenant_id: str, submission_ids: list[str]
    ) -> list[SuspiciousFlag]:
        return await self.repo.list_active_by_assignment(
            tenant_id=tenant_id, submission_ids=submission_ids
        )

    async def clear(self, flag_id_: str, *, cleared_by: str) -> SuspiciousFlag | None:
        return await self.repo.clear(flag_id_, cleared_by=cleared_by)

    async def dismiss(
        self, flag_id_: str, *, cleared_by: str, reason: str
    ) -> SuspiciousFlag | None:
        return await self.repo.dismiss(flag_id_, cleared_by=cleared_by, reason=reason)


def threshold_from_options(options: dict[str, Any] | None) -> float:
    if not options:
        return 0.6
    val = options.get("similarity_threshold", 0.6)
    try:
        return float(val)
    except Exception:
        return 0.6
