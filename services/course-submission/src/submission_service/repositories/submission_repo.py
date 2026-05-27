"""Submission repository — queries and writes for the Submission aggregate."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import and_, case, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from submission_service.models.submission import (
    Submission,
    SubmissionFeedback,
    SubmissionFile,
    SubmissionFlag,
    SubmissionGrade,
    SubmissionGradeHistory,
)


class SubmissionRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ---------- queries ----------

    async def get(self, submission_id: str, *, include_deleted: bool = False) -> Submission | None:
        stmt = select(Submission).where(Submission.id == submission_id)
        if not include_deleted:
            stmt = stmt.where(Submission.deleted_at.is_(None))
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def find_by_dedup(
        self, *, assignment_id: str, author_id: str | None, content_hash: str
    ) -> Submission | None:
        stmt = select(Submission).where(
            and_(
                Submission.assignment_id == assignment_id,
                Submission.content_hash == content_hash,
            )
        )
        if author_id is None:
            stmt = stmt.where(Submission.author_id.is_(None))
        else:
            stmt = stmt.where(Submission.author_id == author_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def find_by_external(
        self, *, source: str, external_id: str, tenant_id: str
    ) -> Submission | None:
        stmt = select(Submission).where(
            and_(
                Submission.source == source,
                Submission.external_id == external_id,
                Submission.tenant_id == tenant_id,
            )
        )
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def max_version(self, *, assignment_id: str, author_id: str | None) -> int:
        stmt = select(func.max(Submission.version)).where(
            Submission.assignment_id == assignment_id
        )
        if author_id is None:
            stmt = stmt.where(Submission.author_id.is_(None))
        else:
            stmt = stmt.where(Submission.author_id == author_id)
        v = (await self.session.execute(stmt)).scalar()
        return int(v or 0)

    async def list_by_assignment(
        self,
        *,
        assignment_id: str,
        tenant_id: str,
        author_id: str | None = None,
        status: str | None = None,
        late: bool | None = None,
        suspicious: bool | None = None,
        language: str | None = None,
        min_score: float | None = None,
        max_score: float | None = None,
        sort: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Submission]:
        stmt = (
            select(Submission)
            .where(Submission.assignment_id == assignment_id)
            .where(Submission.tenant_id == tenant_id)
            .where(Submission.deleted_at.is_(None))
        )
        if author_id is not None:
            stmt = stmt.where(Submission.author_id == author_id)
        if status is not None:
            stmt = stmt.where(Submission.status == status)
        if late is not None:
            stmt = stmt.where(Submission.is_late == late)
        if language is not None:
            stmt = stmt.where(Submission.language == language)
        # `suspicious` is filtered in Python after fetch (works for both
        # PostgreSQL JSONB and SQLite JSON1 backends used in tests).
        if min_score is not None or max_score is not None:
            stmt = stmt.join(SubmissionGrade, isouter=True)
            if min_score is not None:
                stmt = stmt.where(SubmissionGrade.score >= min_score)
            if max_score is not None:
                stmt = stmt.where(SubmissionGrade.score <= max_score)

        order_field = Submission.submitted_at
        descending = True
        if sort:
            field_name = sort.lstrip("-")
            descending = sort.startswith("-")
            order_field = getattr(Submission, field_name, Submission.submitted_at)

        stmt = stmt.order_by(order_field.desc() if descending else order_field.asc())
        stmt = stmt.limit(limit).offset(offset)
        rows = (await self.session.execute(stmt)).scalars().all()
        if suspicious is not None:
            rows = [
                r for r in rows if bool(r.flags.get("suspicious", False)) is bool(suspicious)
            ]
        return list(rows)

    async def list_versions_for_author(
        self, *, assignment_id: str, author_id: str | None, tenant_id: str | None = None
    ) -> list[Submission]:
        stmt = (
            select(Submission)
            .where(Submission.assignment_id == assignment_id)
            .order_by(Submission.version.asc())
        )
        if author_id:
            stmt = stmt.where(Submission.author_id == author_id)
        else:
            stmt = stmt.where(Submission.author_id.is_(None))
        if tenant_id is not None:
            stmt = stmt.where(Submission.tenant_id == tenant_id)
        return list((await self.session.execute(stmt)).scalars().all())

    # External verdicts that count as a "passing" submission. Different
    # judges spell it differently (Yandex.Contest "OK", ejudge "Accepted",
    # generic "AC"); lower-cased compare covers the variants.
    _OK_VERDICTS = ("ok", "accepted", "ac", "passed", "full")

    async def list_latest_per_student(
        self, *, assignment_id: str, tenant_id: str
    ) -> list[Submission]:
        """The "current" submission per student.

        Ordering, most-significant first:
          1. ``author_id`` — group key for the dedup pass below.
          2. OK-verdict first — a student's latest *accepted* attempt is
             what a grader should look at, not a later broken one.
          3. ``submitted_at`` desc — among equally-ranked attempts, the
             chronologically newest wins.

        We deliberately do NOT order by ``version``: version numbers are
        assigned in import order, which for a bulk Yandex.Contest import
        can run newest-first — so ``version`` is not a reliable "newest"
        signal. ``submitted_at`` is. When no submission has a verdict
        (verdict column not populated) rule 2 is a no-op and this is
        simply "latest by time", which is still correct.
        """
        ok_rank = case(
            (
                func.lower(Submission.external_verdict).in_(self._OK_VERDICTS),
                1,
            ),
            else_=0,
        )
        stmt = (
            select(Submission)
            .where(Submission.assignment_id == assignment_id)
            .where(Submission.tenant_id == tenant_id)
            .where(Submission.deleted_at.is_(None))
            .order_by(
                Submission.author_id.asc(),
                ok_rank.desc(),
                Submission.submitted_at.desc(),
            )
        )
        rows = (await self.session.execute(stmt)).scalars().all()
        seen: set[str | None] = set()
        latest: list[Submission] = []
        for r in rows:
            if r.author_id in seen:
                continue
            seen.add(r.author_id)
            latest.append(r)
        return latest

    async def list_latest_per_student_for_course(
        self, *, course_id: str, tenant_id: str
    ) -> list[Submission]:
        """Latest submission per ``(assignment_id, author_id)`` across a
        whole course. Same ranking as ``list_latest_per_student`` but the
        dedup key is the (assignment, student) pair — one current
        submission per student per assignment. Used by the teacher's
        course-wide "distribute among assistants" action."""
        ok_rank = case(
            (
                func.lower(Submission.external_verdict).in_(self._OK_VERDICTS),
                1,
            ),
            else_=0,
        )
        stmt = (
            select(Submission)
            .where(Submission.course_id == course_id)
            .where(Submission.tenant_id == tenant_id)
            .where(Submission.deleted_at.is_(None))
            .order_by(
                Submission.assignment_id.asc(),
                Submission.author_id.asc(),
                ok_rank.desc(),
                Submission.submitted_at.desc(),
            )
        )
        rows = (await self.session.execute(stmt)).scalars().all()
        seen: set[tuple[str, str | None]] = set()
        latest: list[Submission] = []
        for r in rows:
            key = (r.assignment_id, r.author_id)
            if key in seen:
                continue
            seen.add(key)
            latest.append(r)
        return latest

    async def assign_graders(
        self, assignments: dict[str, tuple[str, str]]
    ) -> int:
        """Bulk-set ``assigned_grader_id`` / ``assigned_grader_name`` for a
        ``{submission_id: (grader_id, grader_name)}`` mapping. Returns the
        number of rows updated."""
        if not assignments:
            return 0
        rows = (
            await self.session.execute(
                select(Submission).where(Submission.id.in_(assignments.keys()))
            )
        ).scalars().all()
        for sub in rows:
            grader_id, grader_name = assignments[sub.id]
            sub.assigned_grader_id = grader_id
            sub.assigned_grader_name = grader_name
        await self.session.flush()
        return len(rows)

    # ---------- external-identity claim (Yandex.Contest etc.) ----------

    async def claim_external(
        self, *, tenant_id: str, user_id: str, external_author_id: str
    ) -> int:
        """Reassign imported submissions from an external participant to a user.

        Bulk-updates every ``yandex_contest`` submission in ``tenant_id`` whose
        ``author_id`` equals the external key (e.g. ``yc:126352134``) to the
        real ``user_id``. Returns the number of rows reassigned. Idempotent:
        a second call matches nothing (author_id is now ``usr_...``) → 0.
        """
        result = await self.session.execute(
            update(Submission)
            .where(
                Submission.tenant_id == tenant_id,
                Submission.source == "yandex_contest",
                Submission.author_id == external_author_id,
            )
            .values(author_id=user_id)
        )
        await self.session.flush()
        return result.rowcount or 0

    async def list_external_participants(
        self, *, tenant_id: str, course_id: str
    ) -> list[dict[str, Any]]:
        """Unclaimed Yandex.Contest participants in a course.

        A participant is "unclaimed" iff their ``author_id`` still carries the
        ``yc:`` prefix (claiming rewrites it to the user's ``usr_...`` id).
        Groups the live imported rows by (author_id, author_label) and counts
        submissions. Returns ``{external_id, display_name, submission_count}``
        sorted by display label for a stable roster view.
        """
        stmt = (
            select(
                Submission.author_id,
                Submission.author_label,
                func.count(Submission.id),
            )
            .where(
                Submission.tenant_id == tenant_id,
                Submission.course_id == course_id,
                Submission.source == "yandex_contest",
                Submission.deleted_at.is_(None),
                Submission.author_id.like("yc:%"),
            )
            .group_by(Submission.author_id, Submission.author_label)
            .order_by(Submission.author_label.asc())
        )
        rows = (await self.session.execute(stmt)).all()
        return [
            {
                "external_id": author_id,
                "display_name": author_label,
                "submission_count": int(count),
            }
            for (author_id, author_label, count) in rows
        ]

    async def list_best_per_student(
        self, *, assignment_id: str, tenant_id: str
    ) -> list[Submission]:
        stmt = (
            select(Submission, SubmissionGrade)
            .join(SubmissionGrade, isouter=True)
            .where(Submission.assignment_id == assignment_id)
            .where(Submission.tenant_id == tenant_id)
            .where(Submission.deleted_at.is_(None))
        )
        rows = (await self.session.execute(stmt)).all()
        best: dict[str | None, tuple[Submission, float]] = {}
        for sub, grade in rows:
            score = float(grade.score) if grade and grade.score is not None else -1.0
            current = best.get(sub.author_id)
            if current is None or score > current[1]:
                best[sub.author_id] = (sub, score)
        return [b[0] for b in best.values()]

    async def list_selected_per_student(
        self, *, assignment_id: str, tenant_id: str
    ) -> list[Submission]:
        stmt = (
            select(Submission)
            .where(Submission.assignment_id == assignment_id)
            .where(Submission.tenant_id == tenant_id)
            .where(Submission.selected_for_grading.is_(True))
            .where(Submission.deleted_at.is_(None))
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def list_flagged(
        self, *, course_id: str | None = None, assignment_id: str | None = None, tenant_id: str
    ) -> list[Submission]:
        stmt = (
            select(Submission)
            .where(Submission.tenant_id == tenant_id)
            .where(Submission.deleted_at.is_(None))
        )
        if course_id is not None:
            stmt = stmt.where(Submission.course_id == course_id)
        if assignment_id is not None:
            stmt = stmt.where(Submission.assignment_id == assignment_id)
        rows = (await self.session.execute(stmt)).scalars().all()
        return [r for r in rows if any(bool(v) for v in (r.flags or {}).values())]

    async def list_for_user(
        self,
        *,
        author_id: str,
        tenant_id: str,
        course_id: str | None = None,
        assignment_id: str | None = None,
        language: str | None = None,
        limit: int | None = None,
    ) -> list[Submission]:
        stmt = (
            select(Submission)
            # Eager-load grade so the API can compute ``is_graded``
            # without an async lazy-load (mirrors the staff inbox).
            .options(selectinload(Submission.grade))
            .where(Submission.author_id == author_id)
            .where(Submission.tenant_id == tenant_id)
            .where(Submission.deleted_at.is_(None))
            .order_by(Submission.submitted_at.desc())
        )
        if course_id is not None:
            stmt = stmt.where(Submission.course_id == course_id)
        if assignment_id is not None:
            stmt = stmt.where(Submission.assignment_id == assignment_id)
        if language is not None:
            stmt = stmt.where(Submission.language == language)
        if limit is not None:
            stmt = stmt.limit(limit)
        return list((await self.session.execute(stmt)).scalars().all())

    async def list_inbox_for_staff(
        self,
        *,
        tenant_id: str,
        course_id: str | None = None,
        assignment_id: str | None = None,
        assignment_ids: list[str] | None = None,
        language: str | None = None,
        assigned_grader_id: str | None = None,
        latest_per_student: bool = False,
        limit: int = 200,
    ) -> list[Submission]:
        """Staff inbox — every submission in the tenant (or one course /
        assignment), newest first. Teachers / admins use this to triage what
        needs grading; students never see this surface.

        ``assigned_grader_id`` narrows it to one assistant's pile — the
        "только мои" view after the teacher distributed submissions.

        ``latest_per_student`` collapses multiple versions per
        (assignment_id, author_id) into a single row — the latest one.
        Without it, the teacher sees v1, v2, v3 … of the same submission
        as separate rows and the total count balloons way past the
        student×assignment matrix size. With it, the count reflects
        "how many distinct submissions are pending review".
        """
        stmt = (
            select(Submission)
            # Eager-load the grade so the API layer can bucket rows by
            # "проверено / не проверено" (grade present + score set)
            # without an async lazy-load per row.
            .options(selectinload(Submission.grade))
            .where(Submission.tenant_id == tenant_id)
            .where(Submission.deleted_at.is_(None))
            .order_by(Submission.submitted_at.desc())
            .limit(limit)
        )
        if course_id is not None:
            stmt = stmt.where(Submission.course_id == course_id)
        if assignment_id is not None:
            stmt = stmt.where(Submission.assignment_id == assignment_id)
        # Narrow to a whole homework's worth of assignments. Used by the
        # triage queue's ДЗ filter — a homework fans out to N assignment
        # ids and we want all their submissions in one query.
        if assignment_ids:
            stmt = stmt.where(Submission.assignment_id.in_(assignment_ids))
        if language is not None:
            stmt = stmt.where(Submission.language == language)
        if assigned_grader_id is not None:
            stmt = stmt.where(
                Submission.assigned_grader_id == assigned_grader_id
            )
        rows = list((await self.session.execute(stmt)).scalars().all())
        if not latest_per_student:
            return rows
        # Collapse to one row per (assignment, author) — and pick the SAME
        # "current submission" that distribute / grading use: OK-verdict
        # attempt first, then newest by submitted_at. Picking purely by
        # submitted_at here (while distribute ranks ok_rank → submitted_at
        # in list_latest_per_student*) meant a student who retried *after*
        # getting OK showed their later non-OK row in the queue, which
        # distribute never assigned — so the row looked unassigned
        # ("распределил, но не все"). Choose the canonical representative,
        # then sort survivors newest-first for display (unchanged order,
        # same group count → pagination total is unaffected).
        def _ok_rank(r: Submission) -> int:
            return (
                1
                if (r.external_verdict or "").lower() in self._OK_VERDICTS
                else 0
            )

        best: dict[tuple[str, str | None], Submission] = {}
        for r in rows:
            key = (r.assignment_id, r.author_id)
            cur = best.get(key)
            if cur is None or (_ok_rank(r), r.submitted_at) > (
                _ok_rank(cur),
                cur.submitted_at,
            ):
                best[key] = r
        return sorted(
            best.values(), key=lambda s: s.submitted_at, reverse=True
        )

    # ---------- writes ----------

    async def add(self, sub: Submission) -> None:
        self.session.add(sub)
        await self.session.flush()

    async def add_file(self, file: SubmissionFile) -> None:
        self.session.add(file)
        await self.session.flush()

    async def get_file(self, file_id: str) -> SubmissionFile | None:
        stmt = select(SubmissionFile).where(SubmissionFile.id == file_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_files(self, submission_id: str) -> list[SubmissionFile]:
        stmt = select(SubmissionFile).where(SubmissionFile.submission_id == submission_id)
        return list((await self.session.execute(stmt)).scalars().all())

    # ---------- grades ----------

    async def get_grade(self, submission_id: str) -> SubmissionGrade | None:
        stmt = select(SubmissionGrade).where(SubmissionGrade.submission_id == submission_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def upsert_grade(self, grade: SubmissionGrade) -> SubmissionGrade:
        existing = await self.get_grade(grade.submission_id)
        if existing is None:
            self.session.add(grade)
        else:
            existing.score = grade.score
            existing.max_score = grade.max_score
            existing.applied_multiplier = grade.applied_multiplier
            existing.graded_by = grade.graded_by
            existing.graded_at = grade.graded_at
            existing.comment_visible_to_student = grade.comment_visible_to_student
            existing.comment = grade.comment
            existing.updated_at = grade.updated_at
            existing.history = grade.history
        await self.session.flush()
        return await self.get_grade(grade.submission_id) or grade

    async def add_grade_history(self, entry: SubmissionGradeHistory) -> None:
        self.session.add(entry)
        await self.session.flush()

    async def list_grade_history(
        self, submission_id: str
    ) -> list[SubmissionGradeHistory]:
        stmt = (
            select(SubmissionGradeHistory)
            .where(SubmissionGradeHistory.submission_id == submission_id)
            .order_by(SubmissionGradeHistory.id.asc())
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def delete_grade(self, submission_id: str) -> None:
        existing = await self.get_grade(submission_id)
        if existing is not None:
            await self.session.delete(existing)
            await self.session.flush()

    async def assignment_aggregate_stats(
        self, *, assignment_id: str, tenant_id: str
    ) -> dict[str, Any]:
        """Single-query aggregate stats for an assignment.

        Returns the same shape that ``course_service.stats`` is supposed
        to expose, but computed from real data (this service owns the
        submission + grade tables, so it can do this without HTTP). The
        course service proxies us so the frontend keeps one
        ``GET /assignments/{id}/stats`` endpoint to call.

        Notes:
          • ``submissions_count`` counts the *latest version per
            student* — that's what the UI shows in the tab badge and
            in the row list, so it matches.
          • ``students_submitted`` is the same number by construction
            (one student → one latest row).
          • ``average_score`` is computed over only graded submissions.
            ``None`` if nothing graded yet.
          • ``late_count`` counts late submissions among the latest
            per student.
        """
        # All non-deleted latest-per-student rows (we reuse the existing
        # query so semantics match the UI list 1:1).
        latest = await self.list_latest_per_student(
            assignment_id=assignment_id, tenant_id=tenant_id
        )
        submissions_count = len(latest)
        late_count = sum(1 for s in latest if s.is_late)
        latest_ids = {s.id for s in latest}

        # Fetch grades for THIS assignment in one shot, then restrict
        # to latest-per-student submissions client-side. Doing it via
        # an IN-clause keeps the SQL tidy even if the assignment has
        # thousands of historical attempts.
        grade_rows = await self.list_grades_for_assignment(
            assignment_id=assignment_id, tenant_id=tenant_id
        )
        scores = [
            g.score
            for (g, s) in grade_rows
            if g.score is not None and s.id in latest_ids
        ]
        scored_count = len(scores)
        # ``score`` is a Numeric column → Decimal. Cast the average to
        # ``float`` so it serializes as a JSON number, not a string
        # (a string would break ``.toFixed`` on the frontend).
        avg = (
            float(sum(scores) / scored_count) if scored_count > 0 else None
        )

        return {
            "submissions_count": submissions_count,
            "students_submitted": submissions_count,
            "late_count": late_count,
            "average_score": avg,
            "graded_count": scored_count,
        }

    async def list_grades_for_assignment(
        self, *, assignment_id: str, tenant_id: str
    ) -> list[tuple[SubmissionGrade, Submission]]:
        """All grades for non-deleted submissions of a given assignment.

        Returns pairs (grade, submission) so the caller can index by
        author or whatever else it needs without an extra round-trip.
        Used by the assignment stats page to draw the score histogram
        without fetching grades one-by-one.
        """
        stmt = (
            select(SubmissionGrade, Submission)
            .join(Submission, Submission.id == SubmissionGrade.submission_id)
            .where(
                Submission.assignment_id == assignment_id,
                Submission.tenant_id == tenant_id,
                Submission.deleted_at.is_(None),
            )
        )
        rows = (await self.session.execute(stmt)).all()
        return [(g, s) for (g, s) in rows]

    # ---------- feedback ----------

    async def add_feedback(self, fb: SubmissionFeedback) -> None:
        self.session.add(fb)
        await self.session.flush()

    async def get_feedback(self, fb_id: str) -> SubmissionFeedback | None:
        stmt = select(SubmissionFeedback).where(SubmissionFeedback.id == fb_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_feedback(
        self, submission_id: str, *, visible_only: bool = False
    ) -> list[SubmissionFeedback]:
        stmt = (
            select(SubmissionFeedback)
            .where(SubmissionFeedback.submission_id == submission_id)
            .where(SubmissionFeedback.deleted_at.is_(None))
        )
        if visible_only:
            stmt = stmt.where(SubmissionFeedback.visible_to_student.is_(True))
        return list((await self.session.execute(stmt)).scalars().all())

    # ---------- flags ----------

    async def add_flag(self, flag: SubmissionFlag) -> None:
        self.session.add(flag)
        await self.session.flush()

    async def get_flag(self, flag_id: str) -> SubmissionFlag | None:
        stmt = select(SubmissionFlag).where(SubmissionFlag.id == flag_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def list_flags(self, submission_id: str) -> list[SubmissionFlag]:
        stmt = (
            select(SubmissionFlag)
            .where(SubmissionFlag.submission_id == submission_id)
            .where(SubmissionFlag.cleared_at.is_(None))
        )
        return list((await self.session.execute(stmt)).scalars().all())

    async def clear_flag(self, flag: SubmissionFlag, *, when: datetime) -> None:
        flag.cleared_at = when
        await self.session.flush()


class ProcessedEventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def is_processed(self, event_id: str, consumer_group: str) -> bool:
        from submission_service.models.submission import ProcessedEvent

        stmt = select(ProcessedEvent).where(
            and_(
                ProcessedEvent.event_id == event_id,
                ProcessedEvent.consumer_group == consumer_group,
            )
        )
        return (await self.session.execute(stmt)).scalar_one_or_none() is not None

    async def mark_processed(self, event_id: str, consumer_group: str) -> None:
        from submission_service.models.submission import ProcessedEvent

        self.session.add(
            ProcessedEvent(event_id=event_id, consumer_group=consumer_group)
        )
        await self.session.flush()


class OperationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create(self, op: Any) -> None:
        self.session.add(op)
        await self.session.flush()

    async def get(self, op_id: str) -> Any:
        from submission_service.models.submission import Operation

        stmt = select(Operation).where(Operation.id == op_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()
