"""Submission domain service.

Implements creation, dedup, late detection, multi-version logic, selection
strategy, grading (with late multiplier and hard-deadline zero-scoring),
feedback, flags. Pure business logic — no FastAPI imports here.
"""
from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from submission_service.common import ids
from submission_service.common.problem import (
    ProblemException,
    conflict,
    not_found,
    payload_too_large,
    validation_error,
)
from submission_service.config import get_settings
from submission_service.models.submission import (
    Submission,
    SubmissionFeedback,
    SubmissionFile,
    SubmissionFlag,
    SubmissionGrade,
    SubmissionGradeHistory,
)
from submission_service.repositories.submission_repo import SubmissionRepository
from submission_service.services.course_client import AssignmentInfo, CourseClient
from submission_service.services.file_storage_service import (
    FileStorage,
    storage_layout_key,
)


def utcnow() -> datetime:
    return datetime.now(UTC)


def _aware(dt: datetime | None) -> datetime | None:
    """Force UTC tzinfo on naive datetimes (SQLite test fallback)."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=UTC)
    return dt


@dataclass
class UploadFile:
    filename: str
    content: bytes
    mime_type: str | None = None


@dataclass
class SubmissionCreateResult:
    submission: Submission
    deduplicated: bool


def compute_content_hash(files: list[UploadFile]) -> str:
    """Aggregate sha256 over (filename, content) pairs sorted by filename."""
    h = hashlib.sha256()
    for f in sorted(files, key=lambda x: x.filename):
        h.update(f.filename.encode("utf-8"))
        h.update(b"\x00")
        h.update(f.content)
        h.update(b"\x00")
    return h.hexdigest()


def detect_late(
    submitted_at: datetime, assignment: AssignmentInfo | None
) -> tuple[bool, str | None]:
    """Return (is_late, late_kind) — soft / hard / None."""
    if assignment is None:
        return False, None
    when = submitted_at if submitted_at.tzinfo else submitted_at.replace(tzinfo=UTC)
    soft = assignment.deadline_soft_at
    hard = assignment.deadline_hard_at
    if soft is not None and soft.tzinfo is None:
        soft = soft.replace(tzinfo=UTC)
    if hard is not None and hard.tzinfo is None:
        hard = hard.replace(tzinfo=UTC)
    if hard is not None and when > hard:
        return True, "hard"
    if soft is not None and when > soft:
        return True, "soft"
    return False, None


class SubmissionService:
    """Service-layer for submissions. Orchestrates repository + storage."""

    def __init__(
        self,
        session: AsyncSession,
        *,
        storage: FileStorage,
        course_client: CourseClient,
    ) -> None:
        self.session = session
        self.repo = SubmissionRepository(session)
        self.storage = storage
        self.course_client = course_client
        self.settings = get_settings()

    # ---------- create / dedup ----------

    async def create_manual(
        self,
        *,
        tenant_id: str,
        tenant_slug: str,
        course_id: str,
        assignment_id: str,
        author_id: str | None,
        language: str | None,
        source: str,
        description: str | None,
        external_url: str | None,
        files: list[UploadFile],
        actor_user_id: str,
        external_id: str | None = None,
        submitted_at: datetime | None = None,
        author_label: str | None = None,
        auth_token: str | None = None,
        rebind_existing: bool = False,
        external_verdict: str | None = None,
        external_score: float | None = None,
    ) -> SubmissionCreateResult:
        if not files:
            raise validation_error("At least one file is required")

        total_size = 0
        for f in files:
            sz = len(f.content)
            if sz > self.settings.MAX_FILE_SIZE_BYTES:
                raise payload_too_large(f"File '{f.filename}' exceeds per-file limit")
            total_size += sz
        if total_size > self.settings.MAX_ARCHIVE_SIZE_BYTES:
            raise payload_too_large("Total upload exceeds archive limit")

        content_hash = compute_content_hash(files)
        existing = await self.repo.find_by_dedup(
            assignment_id=assignment_id,
            author_id=author_id,
            content_hash=content_hash,
        )
        if existing is not None and existing.deleted_at is None:
            return SubmissionCreateResult(submission=existing, deduplicated=True)

        if external_id:
            ext_existing = await self.repo.find_by_external(
                source=source, external_id=external_id, tenant_id=tenant_id
            )
            if ext_existing is not None and ext_existing.deleted_at is None:
                # Rebind path: the same external run was imported earlier
                # (typically under a homework that's now been deleted), so
                # the row is "orphaned" pointing at a stale assignment.
                # Move it to the current assignment instead of returning
                # a no-op, otherwise the new homework's tasks would look
                # empty even though the data is in the DB.
                if (
                    rebind_existing
                    and ext_existing.assignment_id != assignment_id
                ):
                    ext_existing.assignment_id = assignment_id
                    ext_existing.course_id = course_id
                    if author_label and not ext_existing.author_label:
                        ext_existing.author_label = author_label
                    await self.session.flush()
                return SubmissionCreateResult(
                    submission=ext_existing, deduplicated=True
                )

        # The course client may require an auth token (forwarded from caller)
        # to read assignments — older signature without the kwarg is supported.
        try:
            assignment = await self.course_client.get_assignment(  # type: ignore[call-arg]
                assignment_id, auth_token=auth_token
            )
        except TypeError:
            assignment = await self.course_client.get_assignment(assignment_id)
        when = submitted_at or utcnow()
        is_late, late_kind = detect_late(when, assignment)

        next_version = (
            await self.repo.max_version(
                assignment_id=assignment_id, author_id=author_id
            )
            + 1
        )

        sub_id = ids.submission_id()
        sub = Submission(
            id=sub_id,
            tenant_id=tenant_id,
            course_id=course_id,
            assignment_id=assignment_id,
            author_id=author_id,
            author_label=author_label,
            version=next_version,
            source=source,
            external_id=external_id,
            external_url=external_url,
            external_verdict=external_verdict,
            external_score=external_score,
            language=language,
            content_hash=content_hash,
            total_size_bytes=total_size,
            submitted_at=when,
            imported_at=utcnow(),
            is_late=is_late,
            late_kind=late_kind,
            status="received",
            flags={},
            description=description,
            selected_for_grading=False,
        )
        await self.repo.add(sub)

        for f in files:
            file_id = ids.file_id()
            key = storage_layout_key(
                submission_id=sub_id,
                file_id=file_id,
                filename=f.filename,
                when=when,
            )
            uri = await self.storage.put_object(
                tenant_slug=tenant_slug,
                key=key,
                data=f.content,
                mime_type=f.mime_type,
            )
            sf = SubmissionFile(
                id=file_id,
                submission_id=sub_id,
                path=f.filename,
                size_bytes=len(f.content),
                mime_type=f.mime_type,
                content_hash=hashlib.sha256(f.content).hexdigest(),
                storage_uri=uri,
            )
            await self.repo.add_file(sf)

        sub.status = "ready"

        # Apply selection strategy
        if assignment is not None:
            await self.update_selected(sub, assignment)

        await self.session.flush()
        return SubmissionCreateResult(submission=sub, deduplicated=False)

    async def update_selected(
        self, sub: Submission, assignment: AssignmentInfo
    ) -> None:
        """Recalculate selected_for_grading per the assignment's strategy."""
        if assignment.selection_strategy == "manual":
            return
        if assignment.selection_strategy == "last":
            # Unselect all other versions of (assignment, author), select this one.
            other = await self.repo.list_versions_for_author(
                assignment_id=sub.assignment_id,
                author_id=sub.author_id or "",
                tenant_id=sub.tenant_id,
            )
            for o in other:
                if o.id == sub.id:
                    o.selected_for_grading = True
                    o.selected_at = utcnow()
                else:
                    o.selected_for_grading = False
            await self.session.flush()
            return
        if assignment.selection_strategy == "best":
            other = await self.repo.list_versions_for_author(
                assignment_id=sub.assignment_id,
                author_id=sub.author_id or "",
                tenant_id=sub.tenant_id,
            )
            best_score = -1.0
            best_sub: Submission | None = None
            for o in other:
                grade = await self.repo.get_grade(o.id)
                score = float(grade.score) if grade and grade.score is not None else -1.0
                if score > best_score:
                    best_score = score
                    best_sub = o
            for o in other:
                o.selected_for_grading = best_sub is not None and o.id == best_sub.id
                if o.selected_for_grading:
                    o.selected_at = utcnow()
            await self.session.flush()

    # ---------- delete ----------

    async def soft_delete(self, sub: Submission, *, actor_user_id: str) -> None:
        sub.deleted_at = utcnow()
        sub.deleted_by = actor_user_id
        await self.session.flush()

    # ---------- selection ----------

    async def select(self, sub: Submission, *, manual: bool = True) -> None:
        sub.selected_for_grading = True
        sub.selected_at = utcnow()
        await self.session.flush()

    async def unselect(self, sub: Submission) -> None:
        sub.selected_for_grading = False
        await self.session.flush()

    # ---------- flags ----------

    async def add_flag(
        self, sub: Submission, *, kind: str, reason: str | None, set_by: str
    ) -> SubmissionFlag:
        flag = SubmissionFlag(
            id=ids.flag_id(),
            submission_id=sub.id,
            kind=kind,
            set_by=set_by,
            reason=reason,
        )
        await self.repo.add_flag(flag)
        flags = dict(sub.flags or {})
        flags[kind] = True
        sub.flags = flags
        await self.session.flush()
        return flag

    async def clear_flag_by_id(self, flag: SubmissionFlag) -> None:
        await self.repo.clear_flag(flag, when=utcnow())
        # Recompute aggregate flags on submission
        sub = await self.repo.get(flag.submission_id)
        if sub is not None:
            remaining = await self.repo.list_flags(sub.id)
            kinds = {f.kind for f in remaining if f.cleared_at is None}
            new_flags = dict(sub.flags or {})
            if flag.kind not in kinds:
                new_flags.pop(flag.kind, None)
            sub.flags = new_flags
            await self.session.flush()

    async def clear_flag_kind(self, sub: Submission, kind: str) -> None:
        existing = [
            f for f in await self.repo.list_flags(sub.id) if f.kind == kind
        ]
        for f in existing:
            await self.repo.clear_flag(f, when=utcnow())
        flags = dict(sub.flags or {})
        flags.pop(kind, None)
        sub.flags = flags
        await self.session.flush()

    # ---------- grading ----------

    async def set_grade(
        self,
        *,
        sub: Submission,
        score: float,
        max_score: float | None,
        comment_visible_to_student: bool,
        graded_by: str,
        assignment: AssignmentInfo | None,
        comment: str | None = None,
    ) -> SubmissionGrade:
        applied_multiplier = 1.0
        final_score = float(score)

        if assignment is not None:
            sub_when = _aware(sub.submitted_at)
            hard = _aware(assignment.deadline_hard_at)
            # Hard-deadline rule: forced score=0.
            if hard is not None and sub_when is not None and sub_when > hard:
                final_score = 0.0
                applied_multiplier = 0.0
            elif sub.is_late and sub.late_kind == "soft":
                applied_multiplier = float(assignment.late_score_multiplier or 1.0)
                final_score = float(score) * applied_multiplier

        existing = await self.repo.get_grade(sub.id)
        prev_score = float(existing.score) if existing and existing.score is not None else None
        action = "assigned" if existing is None else "changed"

        grade = SubmissionGrade(
            submission_id=sub.id,
            score=final_score,
            max_score=max_score if max_score is not None else (assignment.max_score if assignment else None),
            applied_multiplier=applied_multiplier,
            graded_by=graded_by,
            graded_at=utcnow(),
            comment_visible_to_student=comment_visible_to_student,
            comment=(comment.strip() if comment and comment.strip() else None),
            updated_at=utcnow(),
            history=(existing.history if existing else [])
            + [
                {
                    "score": final_score,
                    "applied_multiplier": applied_multiplier,
                    "graded_by": graded_by,
                    "graded_at": utcnow().isoformat(),
                    "action": action,
                    "prev_score": prev_score,
                }
            ],
        )
        result = await self.repo.upsert_grade(grade)
        await self.repo.add_grade_history(
            SubmissionGradeHistory(
                submission_id=sub.id,
                score=final_score,
                applied_multiplier=applied_multiplier,
                graded_by=graded_by,
                action=action,
                note=None,
            )
        )

        # Re-evaluate selection if strategy=best
        if assignment is not None and assignment.selection_strategy == "best":
            await self.update_selected(sub, assignment)
        return result

    async def patch_grade(
        self,
        *,
        sub: Submission,
        score: float | None,
        max_score: float | None,
        comment_visible_to_student: bool | None,
        graded_by: str,
        assignment: AssignmentInfo | None,
        comment: str | None = None,
        comment_provided: bool = False,
    ) -> SubmissionGrade:
        existing = await self.repo.get_grade(sub.id)
        if existing is None:
            raise not_found("Grade not set")
        new_score = float(score) if score is not None else (
            float(existing.score) if existing.score is not None else 0.0
        )
        # PATCH semantics: only overwrite the comment when the request
        # explicitly carried one (``comment_provided``). Otherwise we
        # preserve whatever was saved previously.
        return await self.set_grade(
            sub=sub,
            score=new_score,
            max_score=max_score if max_score is not None else (
                float(existing.max_score) if existing.max_score is not None else None
            ),
            comment_visible_to_student=(
                comment_visible_to_student
                if comment_visible_to_student is not None
                else bool(existing.comment_visible_to_student)
            ),
            graded_by=graded_by,
            assignment=assignment,
            comment=(comment if comment_provided else existing.comment),
        )

    async def remove_grade(self, sub: Submission, *, actor_user_id: str) -> None:
        existing = await self.repo.get_grade(sub.id)
        if existing is None:
            return
        await self.repo.add_grade_history(
            SubmissionGradeHistory(
                submission_id=sub.id,
                score=float(existing.score) if existing.score is not None else None,
                applied_multiplier=float(existing.applied_multiplier),
                graded_by=actor_user_id,
                action="removed",
                note=None,
            )
        )
        await self.repo.delete_grade(sub.id)

    # ---------- feedback ----------

    async def add_feedback(
        self,
        *,
        sub: Submission,
        author_id: str,
        body: str,
        visible_to_student: bool,
        source: str = "manual",
    ) -> SubmissionFeedback:
        if not body.strip():
            raise validation_error("Feedback body cannot be empty")
        fb = SubmissionFeedback(
            id=ids.feedback_id(),
            submission_id=sub.id,
            author_id=author_id,
            body=body,
            visible_to_student=visible_to_student,
            source=source,
        )
        await self.repo.add_feedback(fb)
        return fb

    async def patch_feedback(
        self,
        fb: SubmissionFeedback,
        *,
        body: str | None,
        visible_to_student: bool | None,
    ) -> SubmissionFeedback:
        if body is not None:
            if not body.strip():
                raise validation_error("Feedback body cannot be empty")
            fb.body = body
        if visible_to_student is not None:
            fb.visible_to_student = visible_to_student
        fb.updated_at = utcnow()
        await self.session.flush()
        return fb

    async def soft_delete_feedback(self, fb: SubmissionFeedback) -> None:
        fb.deleted_at = utcnow()
        await self.session.flush()

    async def publish_feedback(
        self, fb: SubmissionFeedback, *, visible: bool
    ) -> SubmissionFeedback:
        fb.visible_to_student = visible
        fb.updated_at = utcnow()
        await self.session.flush()
        return fb

    # ---------- bulk helpers ----------

    async def bulk_publish_feedback(
        self, submission_ids: list[str]
    ) -> list[SubmissionFeedback]:
        published: list[SubmissionFeedback] = []
        for sub_id in submission_ids:
            for fb in await self.repo.list_feedback(sub_id):
                if not fb.visible_to_student:
                    fb.visible_to_student = True
                    fb.updated_at = utcnow()
                    published.append(fb)
        await self.session.flush()
        return published


def assert_problem(condition: bool, exc: ProblemException) -> None:
    if not condition:
        raise exc


__all__ = [
    "SubmissionService",
    "SubmissionCreateResult",
    "UploadFile",
    "compute_content_hash",
    "detect_late",
    "utcnow",
    "conflict",
]
