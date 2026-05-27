"""Submission DTOs."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class SubmissionFileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    submission_id: str
    path: str
    size_bytes: int
    mime_type: str | None = None
    content_hash: str
    storage_uri: str
    created_at: datetime


class SubmissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    tenant_id: str
    course_id: str
    assignment_id: str
    author_id: str | None
    # Display label for non-user authors (Yandex.Contest participants etc).
    # The UI shows this when there's no PlagLens user behind ``author_id``.
    author_label: str | None = None
    anon_id: str | None = None
    version: int
    source: str
    external_id: str | None = None
    external_url: str | None = None
    language: str | None = None
    content_hash: str
    total_size_bytes: int
    submitted_at: datetime
    imported_at: datetime
    external_verdict: str | None = None
    external_score: float | None = None
    is_late: bool
    late_kind: str | None = None
    status: str
    flags: dict[str, Any] = Field(default_factory=dict)
    selected_for_grading: bool
    selected_at: datetime | None = None
    description: str | None = None
    # Grader this submission is assigned to (teacher's "distribute among
    # assistants" round-robin). ``name`` denormalised for list-row display.
    assigned_grader_id: str | None = None
    assigned_grader_name: str | None = None
    deleted_at: datetime | None = None
    # Denormalised course/homework/assignment titles so the cross-course
    # triage list can label every row ("Задача · ДЗ · Курс") without the
    # client fetching assignments per-course. Populated by the inbox
    # endpoint via a batch lookup; null on surfaces that don't enrich.
    assignment_title: str | None = None
    homework_title: str | None = None
    course_name: str | None = None
    # True when a grade row with a score exists — lets the list show
    # the grade (or a "проверено" indicator) without a second round-trip.
    is_graded: bool = False
    # Final grade, surfaced on staff triage rows so the queue shows the
    # actual оценка ("8 / 10") instead of a generic "проверено" badge.
    # Populated only on the staff inbox path — NEVER for the student
    # self-service list, where grade visibility is gated by
    # comment_visible_to_student + the assignment release schedule (see
    # the my_grade endpoint). Null when ungraded or not authorised.
    score: float | None = None
    max_score: float | None = None


class SubmissionDetail(SubmissionOut):
    files: list[SubmissionFileOut] = Field(default_factory=list)


class GraderRef(BaseModel):
    """One assistant in a distribute request — id, display name, and a
    relative ``weight`` used by the allocator. The name is forwarded by
    the caller (it already has course members loaded) and denormalised
    onto each submission for display.

    ``weight`` controls how many submissions this assistant gets
    relative to the others. ``weight=0`` excludes the assistant
    entirely — handy when someone went on leave but you don't want to
    remove them from the course. Defaults to 1.0, which reproduces the
    legacy equal-split round-robin.
    """

    id: str
    name: str
    weight: float = Field(default=1.0, ge=0)


class DistributeRequest(BaseModel):
    """Round-robin a course's or an assignment's submissions across the
    given graders. Exactly one of ``course_id`` / ``assignment_id`` must
    be set — it selects the scope. Only the *latest version per student*
    that isn't already assigned gets a grader, so re-running is safe."""

    course_id: str | None = None
    assignment_id: str | None = None
    graders: list[GraderRef] = Field(min_length=1)


class DistributeResult(BaseModel):
    assigned: int
    graders: int
    skipped: int  # already-assigned latest-per-student rows left untouched


class ClaimExternalRequest(BaseModel):
    """Body of POST /submissions:claim-external (admin/service token).

    Reassigns a Yandex.Contest participant's imported submissions to a real
    PlagLens user. ``user_id`` is the target; ``external_author_id`` is the
    ``yc:<uid>`` key carried by the imported rows. The tenant is taken from
    the caller's token, never the body.
    """

    user_id: str = Field(min_length=1)
    external_author_id: str = Field(min_length=1)


class ClaimExternalResult(BaseModel):
    claimed: int


class ExternalParticipantOut(BaseModel):
    external_id: str
    display_name: str | None = None
    submission_count: int


class ManualUploadMetadata(BaseModel):
    """Multipart form fields wrapped in a Pydantic model for validation."""

    author_id: str | None = None
    language: str | None = None
    source: str = "manual"
    description: str | None = None
    external_url: str | None = None


class FlagPayload(BaseModel):
    kind: str = Field(min_length=1, max_length=32)
    reason: str | None = None


class FlagOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    submission_id: str
    kind: str
    set_by: str | None = None
    reason: str | None = None
    created_at: datetime
    cleared_at: datetime | None = None


class SelectionRule(BaseModel):
    rule: str = Field(pattern="^(last|best|by_id|manual)$")
    ids: list[str] = Field(default_factory=list)


class BatchImportFileIn(BaseModel):
    """Single source file inside an imported submission."""

    path: str = Field(min_length=1, max_length=512)
    content: str  # raw text — we don't accept binary here (use ZIP for that)
    mime_type: str | None = None


class BatchImportItemIn(BaseModel):
    """One submission as supplied by an external system (Yandex.Contest etc)."""

    author_id: str | None = None  # if caller already resolved login → user
    author_login: str | None = None  # falls back to identity lookup
    # Display label persisted on the submission row. Used when the caller
    # intentionally does NOT create a user in identity (Yandex.Contest mode):
    # we keep participants as ``author_id="yc:<uid>"`` and rely on this label
    # for human-readable rendering ("Петров Александр Сергеевич" or login).
    author_label: str | None = None
    language: str | None = None
    files: list[BatchImportFileIn] = Field(min_length=1)
    submitted_at: datetime | None = None
    external_id: str | None = None
    external_url: str | None = None
    external_verdict: str | None = None
    external_score: float | None = None


class BatchImportRequestIn(BaseModel):
    """Programmatic bulk-import; counterpart to batchCreate that takes a ZIP.

    ``rebind_existing`` — when an item collides with an existing submission
    on ``(source, external_id, tenant)`` (because the same YC run was
    imported earlier under a different assignment / homework), move the
    existing row to *this* assignment instead of returning it as a no-op.
    Without this flag, re-importing a contest whose old homework was
    deleted leaves the new homework's tasks empty: the rows still exist
    in the DB but point at the deleted assignment.
    """

    course_id: str
    source: str = Field(default="yandex_contest", max_length=64)
    rebind_existing: bool = False
    items: list[BatchImportItemIn] = Field(min_length=1, max_length=1000)


class BatchImportResultItem(BaseModel):
    external_id: str | None = None
    author_login: str | None = None
    submission_id: str | None = None
    status: str  # "created" | "deduplicated" | "skipped" | "failed"
    reason: str | None = None


class BatchImportResult(BaseModel):
    created: int
    deduplicated: int
    skipped: int
    failed: int
    operation_id: str
    items: list[BatchImportResultItem] = Field(default_factory=list)


class FileContentParams(BaseModel):
    as_: str | None = Field(default=None, alias="as")
