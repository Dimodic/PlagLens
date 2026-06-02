"""Assignment service."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import structlog
from plaglens_common.errors import PlagLensError, UpstreamFailedError, UpstreamTimeoutError
from plaglens_common.service_client import ServiceClient
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..common.problem import ProblemException
from ..common.slug import slugify, unique_slug
from ..config import get_settings
from ..deps import CurrentUser
from ..events.producer import CourseEventPublisher
from ..models import (
    Assignment,
    AssignmentDeadlineExtension,
    AssignmentGradingConfig,
    Course,
)
from ..repositories.assignments import AssignmentRepository
from ..repositories.courses import CourseRepository
from ..schemas.assignment import (
    AssignmentCreate,
    AssignmentDeadlinesUpdate,
    AssignmentDuplicate,
    AssignmentUpdate,
    DeadlineExtensionCreate,
    EffectiveDeadline,
    GradingConfigUpdate,
)
from .integration_client import IntegrationClient
from .submission_stats_client import get_submission_stats_client

logger = structlog.get_logger(__name__)


class AssignmentService:
    def __init__(
        self,
        session: AsyncSession,
        publisher: CourseEventPublisher,
        integration: IntegrationClient,
    ) -> None:
        self.session = session
        self.publisher = publisher
        self.integration = integration
        self.repo = AssignmentRepository(session)
        self.courses = CourseRepository(session)

    async def _validate_external_bindings(
        self, bindings, *, tenant_id: str, bearer: str | None
    ) -> None:
        for b in bindings:
            data = b.model_dump() if hasattr(b, "model_dump") else dict(b)
            await self.integration.validate_external_binding(
                system=data["system"],
                external_assignment_id=data["external_assignment_id"],
                tenant_id=tenant_id,
                bearer_token=bearer,
            )

    async def create(
        self,
        course: Course,
        payload: AssignmentCreate,
        user: CurrentUser,
        *,
        bearer_token: str | None = None,
    ) -> Assignment:
        await self._validate_external_bindings(
            payload.external_bindings or [], tenant_id=course.tenant_id, bearer=bearer_token
        )
        bindings = [b.model_dump() for b in (payload.external_bindings or [])]
        # Honor a client-provided slug verbatim (uniqueness enforced by the DB
        # constraint -> 409); otherwise auto-derive it from the title.
        if payload.slug:
            slug = payload.slug
        else:
            base = await slugify(payload.title, fallback="assignment")

            async def _taken(s: str) -> bool:
                return await self.repo.get_by_slug(course.id, s) is not None

            slug = await unique_slug(base, exists=_taken)
        assignment = Assignment(
            course_id=course.id,
            homework_id=payload.homework_id,
            slug=slug,
            title=payload.title,
            description=payload.description,
            language_hint=payload.language_hint,
            status="active",
            max_score=payload.max_score,
            weight=payload.weight,
            deadline_soft_at=payload.deadline_soft_at,
            deadline_hard_at=payload.deadline_hard_at,
            late_score_multiplier=payload.late_score_multiplier,
            selection_strategy=payload.selection_strategy,
            plagiarism_auto_run=payload.plagiarism_auto_run,
            plagiarism_threshold=payload.plagiarism_threshold,
            ai_auto_run=payload.ai_auto_run,
            ai_prompt_version=payload.ai_prompt_version,
            external_bindings=bindings,
        )
        try:
            await self.repo.create(assignment)
        except IntegrityError as exc:
            raise ProblemException(
                status_code=409, detail="Assignment slug already used", code="CONFLICT"
            ) from exc
        await self.publisher.publish_assignment(
            event_type="plaglens.course.assignment.created.v1",
            assignment_id=assignment.id,
            course_id=course.id,
            tenant_id=course.tenant_id,
            actor_id=user.user_id,
            actor_role=user.global_role,
            data={"slug": assignment.slug, "title": assignment.title},
        )
        return assignment

    async def update(
        self, assignment: Assignment, payload: AssignmentUpdate, user: CurrentUser
    ) -> Assignment:
        course = await self.courses.get(assignment.course_id)
        assert course is not None
        data = payload.model_dump(exclude_unset=True)
        if "external_bindings" in data and data["external_bindings"] is not None:
            data["external_bindings"] = [
                b.model_dump() if hasattr(b, "model_dump") else dict(b)
                for b in data["external_bindings"]
            ]
        deadline_changed = bool({"deadline_soft_at", "deadline_hard_at"} & set(data.keys()))
        for field, value in data.items():
            setattr(assignment, field, value)
        await self.session.flush()
        await self.publisher.publish_assignment(
            event_type="plaglens.course.assignment.updated.v1",
            assignment_id=assignment.id,
            course_id=course.id,
            tenant_id=course.tenant_id,
            actor_id=user.user_id,
            actor_role=user.global_role,
            data={"changed_fields": sorted(data.keys())},
        )
        if deadline_changed:
            await self.publisher.publish_assignment(
                event_type="plaglens.course.assignment.deadline_changed.v1",
                assignment_id=assignment.id,
                course_id=course.id,
                tenant_id=course.tenant_id,
                actor_id=user.user_id,
                actor_role=user.global_role,
                data={
                    "deadline_soft_at": (
                        assignment.deadline_soft_at.isoformat()
                        if assignment.deadline_soft_at
                        else None
                    ),
                    "deadline_hard_at": (
                        assignment.deadline_hard_at.isoformat()
                        if assignment.deadline_hard_at
                        else None
                    ),
                },
            )
        return assignment

    async def delete(self, assignment: Assignment, user: CurrentUser) -> None:
        course = await self.courses.get(assignment.course_id)
        assert course is not None
        await self.repo.soft_delete(assignment)
        await self.publisher.publish_assignment(
            event_type="plaglens.course.assignment.deleted.v1",
            assignment_id=assignment.id,
            course_id=course.id,
            tenant_id=course.tenant_id,
            actor_id=user.user_id,
            actor_role=user.global_role,
            data={},
        )

    async def transition(
        self, assignment: Assignment, *, target: str, user: CurrentUser
    ) -> Assignment:
        # Archive-only lifecycle: the only legitimate transition is
        # ``archive`` (and ``active`` for un-archive, in case we add
        # that back later). The legacy ``published`` value is rejected.
        if target not in {"active", "archived"}:
            raise ProblemException(
                status_code=400, detail="Invalid target status", code="BAD_REQUEST"
            )
        assignment.status = target
        await self.session.flush()
        course = await self.courses.get(assignment.course_id)
        assert course is not None
        await self.publisher.publish_assignment(
            event_type="plaglens.course.assignment.updated.v1",
            assignment_id=assignment.id,
            course_id=course.id,
            tenant_id=course.tenant_id,
            actor_id=user.user_id,
            actor_role=user.global_role,
            data={"status": target},
        )
        return assignment

    async def duplicate(
        self,
        source: Assignment,
        payload: AssignmentDuplicate,
        user: CurrentUser,
    ) -> Assignment:
        # TODO: deep-copy of grading config and extensions
        target_course_id = payload.target_course_id or source.course_id
        target_course = await self.courses.get(target_course_id)
        if target_course is None:
            raise ProblemException(
                status_code=404, detail="Target course not found", code="NOT_FOUND"
            )
        clone_title = payload.new_title or f"{source.title} (copy)"
        # Honor a client-provided slug verbatim; otherwise auto-derive it from
        # the clone's title.
        if payload.new_slug:
            new_slug = payload.new_slug
        else:
            base = await slugify(clone_title, fallback="assignment")

            async def _taken(s: str) -> bool:
                return await self.repo.get_by_slug(target_course.id, s) is not None

            new_slug = await unique_slug(base, exists=_taken)
        clone = Assignment(
            course_id=target_course.id,
            slug=new_slug,
            title=clone_title,
            description=source.description,
            language_hint=source.language_hint,
            status="active",
            max_score=source.max_score,
            weight=source.weight,
            deadline_soft_at=source.deadline_soft_at,
            deadline_hard_at=source.deadline_hard_at,
            late_score_multiplier=source.late_score_multiplier,
            selection_strategy=source.selection_strategy,
            plagiarism_auto_run=source.plagiarism_auto_run,
            plagiarism_threshold=source.plagiarism_threshold,
            ai_auto_run=source.ai_auto_run,
            ai_prompt_version=source.ai_prompt_version,
            external_bindings=list(source.external_bindings or []),
        )
        await self.repo.create(clone)
        await self.publisher.publish_assignment(
            event_type="plaglens.course.assignment.created.v1",
            assignment_id=clone.id,
            course_id=target_course.id,
            tenant_id=target_course.tenant_id,
            actor_id=user.user_id,
            actor_role=user.global_role,
            data={"slug": clone.slug, "duplicated_from": source.id},
        )
        return clone

    async def update_deadlines(
        self,
        assignment: Assignment,
        payload: AssignmentDeadlinesUpdate,
        user: CurrentUser,
    ) -> Assignment:
        data = payload.model_dump(exclude_unset=True)
        for field, value in data.items():
            setattr(assignment, field, value)
        await self.session.flush()
        course = await self.courses.get(assignment.course_id)
        assert course is not None
        await self.publisher.publish_assignment(
            event_type="plaglens.course.assignment.deadline_changed.v1",
            assignment_id=assignment.id,
            course_id=course.id,
            tenant_id=course.tenant_id,
            actor_id=user.user_id,
            actor_role=user.global_role,
            data={
                "deadline_soft_at": (
                    assignment.deadline_soft_at.isoformat()
                    if assignment.deadline_soft_at
                    else None
                ),
                "deadline_hard_at": (
                    assignment.deadline_hard_at.isoformat()
                    if assignment.deadline_hard_at
                    else None
                ),
                "late_score_multiplier": float(assignment.late_score_multiplier),
            },
        )
        return assignment

    async def effective_deadline(
        self, assignment: Assignment, user_id: str
    ) -> EffectiveDeadline:
        ext = await self.repo.get_extension_for_user(assignment.id, user_id)
        if ext is None:
            return EffectiveDeadline(
                assignment_id=assignment.id,
                user_id=user_id,
                deadline_soft_at=assignment.deadline_soft_at,
                deadline_hard_at=assignment.deadline_hard_at,
                extended=False,
            )
        return EffectiveDeadline(
            assignment_id=assignment.id,
            user_id=user_id,
            deadline_soft_at=ext.deadline_soft_at or assignment.deadline_soft_at,
            deadline_hard_at=ext.deadline_hard_at or assignment.deadline_hard_at,
            extended=True,
            extension_id=ext.id,
        )

    async def create_extension(
        self,
        assignment: Assignment,
        payload: DeadlineExtensionCreate,
        user: CurrentUser,
    ) -> AssignmentDeadlineExtension:
        existing = await self.repo.get_extension_for_user(assignment.id, payload.user_id)
        if existing is not None:
            existing.deadline_soft_at = payload.deadline_soft_at
            existing.deadline_hard_at = payload.deadline_hard_at
            existing.reason = payload.reason
            existing.created_by = user.user_id
            existing.created_at = datetime.now(tz=UTC)
            await self.session.flush()
            return existing
        ext = AssignmentDeadlineExtension(
            assignment_id=assignment.id,
            user_id=payload.user_id,
            deadline_soft_at=payload.deadline_soft_at,
            deadline_hard_at=payload.deadline_hard_at,
            reason=payload.reason,
            created_by=user.user_id,
        )
        return await self.repo.create_extension(ext)

    async def update_grading(
        self, assignment: Assignment, payload: GradingConfigUpdate
    ) -> AssignmentGradingConfig:
        return await self.repo.upsert_grading_config(
            assignment.id,
            rubric=payload.rubric,
            pass_threshold=payload.pass_threshold,
            visible_to_students_at=payload.visible_to_students_at,
        )

    async def update_rubric(
        self, assignment: Assignment, rubric: dict[str, Any]
    ) -> AssignmentGradingConfig:
        return await self.repo.upsert_grading_config(assignment.id, rubric=rubric)

    async def _submission_aggregate(
        self, assignment: Assignment, *, tenant_id: str
    ) -> dict[str, Any] | None:
        """Submission-side aggregate, read in-process (no self-HTTP).

        Submission lives in the same process, so we go through the wired
        ``SubmissionStatsClient`` instead of calling its HTTP endpoint. Returns
        ``None`` — the same best-effort signal the old HTTP ``_get`` used — when
        the client isn't wired (course-only app / unit tests) or the read fails,
        so ``stats()`` degrades to zeros exactly as before.
        """
        client = get_submission_stats_client()
        if client is None:
            return None
        try:
            return await client.aggregate_stats(
                assignment_id=str(assignment.id), tenant_id=tenant_id
            )
        except Exception as exc:  # noqa: BLE001 — best-effort, mirrors HTTP path
            logger.warning(
                "assignment.stats.submission_in_process_failed",
                assignment_id=assignment.id,
                error=str(exc),
            )
            return None

    async def stats(
        self,
        assignment: Assignment,
        *,
        tenant_id: str,
        bearer_token: str | None = None,
    ) -> dict[str, Any]:
        """Assemble assignment stats from the data owners: submission for
        counts/grades, plagiarism for alerts, ai for analysis count. Each
        source is best-effort — if it fails we fall back to zero so the UI
        degrades gracefully instead of 500-ing.

        Submission runs in the SAME process (merged course+submission
        deployable), so its aggregate is read in-process via the wired
        ``SubmissionStatsClient`` — no self-HTTP. Plagiarism and ai ARE
        separate services and stay HTTP via the shared ``ServiceClient``.

        Auth: the HTTP calls pass through the caller's bearer token rather
        than minting a service JWT; those services check course-staff role on
        the same identity. The in-process submission read needs no token —
        the course ``/stats`` endpoint already gated on course-staff before
        calling us — but it does need the caller's ``tenant_id`` (the value
        the old proxy read from the bearer) to scope the aggregate.
        """
        settings = get_settings()
        headers: dict[str, str] = {}
        if bearer_token:
            headers["Authorization"] = f"Bearer {bearer_token}"
        # Downstream services pick up tenant_id from the bearer JWT, so
        # we don't need to forward an X-Tenant-Id header explicitly.

        async def _get(base: str, path: str, *, provider: str) -> dict[str, Any] | None:
            # Same endpoints/method/timeout/auth as before; transport is now
            # the shared ServiceClient (retry + circuit-breaker + request-id).
            # ServiceClient *raises* on transport failure (UpstreamFailed/
            # Timeout) and on >=400 (typed PlagLensError) where the old code
            # returned None — so we swallow those to keep the best-effort
            # degradation (the /stats endpoint must not 500 when a downstream
            # is down). 4xx/5xx → downstream_error; transport → unreachable.
            try:
                async with ServiceClient(
                    base_url=base,
                    provider=provider,
                    timeout=settings.http_client_timeout_s,
                    default_headers=headers or None,
                ) as client:
                    r = await client.get(path)
                return r.json() if r.content else None
            except (UpstreamTimeoutError, UpstreamFailedError) as exc:
                logger.warning(
                    "assignment.stats.downstream_unreachable",
                    base=base,
                    path=path,
                    error=str(exc),
                )
                return None
            except PlagLensError as exc:
                logger.warning(
                    "assignment.stats.downstream_error",
                    base=base,
                    path=path,
                    error=str(exc),
                )
                return None

        sub = await self._submission_aggregate(assignment, tenant_id=tenant_id)
        plag = await _get(
            settings.plagiarism_service_url,
            f"/api/v1/assignments/{assignment.id}/plagiarism-runs?limit=1",
            provider="plagiarism",
        )
        ai = await _get(
            settings.ai_service_url,
            f"/api/v1/assignments/{assignment.id}/ai-analyses?limit=1",
            provider="ai",
        )

        # Extract plagiarism_alerts from the latest completed run.
        plag_alerts = 0
        if isinstance(plag, dict):
            runs = plag.get("data") or []
            if runs and isinstance(runs[0], dict):
                if runs[0].get("status") == "completed":
                    plag_alerts = int(runs[0].get("pairs_suspected") or 0)

        # AI count from pagination.total when present, else len(data).
        ai_count = 0
        if isinstance(ai, dict):
            pg = ai.get("pagination") or {}
            if isinstance(pg.get("total"), int):
                ai_count = pg["total"]
            elif isinstance(ai.get("data"), list):
                ai_count = len(ai["data"])

        return {
            "assignment_id": assignment.id,
            "submissions_count": (sub or {}).get("submissions_count", 0),
            "students_submitted": (sub or {}).get("students_submitted", 0),
            "average_score": (sub or {}).get("average_score"),
            "late_count": (sub or {}).get("late_count", 0),
            "graded_count": (sub or {}).get("graded_count", 0),
            "plagiarism_alerts": plag_alerts,
            "ai_runs": ai_count,
        }

    async def stats_timeline(self, assignment: Assignment) -> list[dict[str, Any]]:
        # TODO: proxy to Submission/Reporting; placeholder shape.
        return []
