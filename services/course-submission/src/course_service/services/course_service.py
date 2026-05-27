"""Course service: business logic for courses + members + invitations + groups."""

from __future__ import annotations

import secrets
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..common.problem import ProblemException
from ..common.redis_client import RedisClient
from ..common.slug import slugify, unique_slug
from ..deps import CurrentUser
from ..events.producer import CourseEventPublisher
from ..models import (
    Assignment,
    AssignmentGradingConfig,
    Course,
    CourseInvitation,
    CourseMember,
    CourseOwner,
    Group,
    GroupMember,
)
from ..repositories.assignments import AssignmentRepository
from ..repositories.courses import CourseRepository
from ..repositories.groups import GroupRepository
from ..repositories.invitations import InvitationRepository
from ..repositories.members import MemberRepository
from ..schemas.course import CourseCreate, CourseDuplicate, CourseUpdate
from ..schemas.group import GroupCreate, GroupUpdate
from ..schemas.invitation import InvitationCreate
from ..schemas.member import (
    BatchMemberCreate,
    BulkInviteRequest,
    MemberCreate,
)

if TYPE_CHECKING:
    from .assignment_service import AssignmentService


def _generate_invite_code() -> str:
    return f"{secrets.token_hex(2).upper()}-{secrets.token_hex(2).upper()}"


class CourseService:
    def __init__(
        self,
        session: AsyncSession,
        publisher: CourseEventPublisher,
        redis: RedisClient | None = None,
    ) -> None:
        self.session = session
        self.publisher = publisher
        self.redis = redis
        self.courses = CourseRepository(session)
        self.members = MemberRepository(session)
        self.groups = GroupRepository(session)
        self.invitations = InvitationRepository(session)
        self.assignments = AssignmentRepository(session)

    # ----- Courses -----------------------------------------------------------------
    async def create_course(self, payload: CourseCreate, user: CurrentUser) -> Course:
        # Honor a client-provided slug verbatim (uniqueness is enforced by the
        # DB constraint -> 409 below); otherwise auto-derive it from the name.
        if payload.slug:
            slug = payload.slug
        else:
            base = await slugify(payload.name, fallback="course")

            async def _taken(s: str) -> bool:
                # Include soft-deleted rows — a soft-deleted course still
                # reserves its (tenant_id, slug) per the unique constraint.
                res = await self.session.execute(
                    select(Course.id)
                    .where(Course.tenant_id == user.tenant_id, Course.slug == s)
                    .limit(1)
                )
                return res.scalar_one_or_none() is not None

            slug = await unique_slug(base, exists=_taken)
        course = Course(
            tenant_id=user.tenant_id,
            slug=slug,
            name=payload.name,
            description=payload.description,
            # Archive-only lifecycle — new courses are "active". The
            # legacy "draft" value was dropped (CourseStatus literal is
            # active|archived); leaving it here 500'd on CourseRead
            # serialization.
            status="active",
            start_date=payload.start_date,
            end_date=payload.end_date,
            owner_id=user.user_id,
            settings=payload.settings or {},
        )
        try:
            await self.courses.create(course, primary_owner_id=user.user_id)
        except IntegrityError as exc:
            raise ProblemException(
                status_code=409, detail="Course slug already used", code="CONFLICT"
            ) from exc
        await self.publisher.publish_course(
            event_type="plaglens.course.course.created.v1",
            course_id=course.id,
            tenant_id=user.tenant_id,
            actor_id=user.user_id,
            actor_role=user.global_role,
            data={"slug": course.slug, "name": course.name},
        )
        return course

    async def update_course(
        self, course: Course, payload: CourseUpdate, user: CurrentUser
    ) -> Course:
        data = payload.model_dump(exclude_unset=True)
        for field, value in data.items():
            setattr(course, field, value)
        await self.session.flush()
        await self.publisher.publish_course(
            event_type="plaglens.course.course.updated.v1",
            course_id=course.id,
            tenant_id=course.tenant_id,
            actor_id=user.user_id,
            actor_role=user.global_role,
            data={"changed_fields": sorted(data.keys())},
        )
        return course

    async def archive_course(self, course: Course, user: CurrentUser) -> Course:
        course.status = "archived"
        await self.session.flush()
        await self.publisher.publish_course(
            event_type="plaglens.course.course.archived.v1",
            course_id=course.id,
            tenant_id=course.tenant_id,
            actor_id=user.user_id,
            actor_role=user.global_role,
            data={},
        )
        return course

    async def unarchive_course(self, course: Course, user: CurrentUser) -> Course:
        course.status = "active"
        await self.session.flush()
        await self.publisher.publish_course(
            event_type="plaglens.course.course.updated.v1",
            course_id=course.id,
            tenant_id=course.tenant_id,
            actor_id=user.user_id,
            actor_role=user.global_role,
            data={"unarchived": True},
        )
        return course

    async def delete_course(self, course: Course, user: CurrentUser) -> None:
        await self.courses.soft_delete(course, by_user=user.user_id)
        # Cascade soft-delete to assignments. Submissions react via Kafka event.
        await self.assignments.soft_delete_for_course(course.id)
        await self.publisher.publish_course(
            event_type="plaglens.course.course.deleted.v1",
            course_id=course.id,
            tenant_id=course.tenant_id,
            actor_id=user.user_id,
            actor_role=user.global_role,
            data={},
        )

    async def duplicate_course(
        self,
        source: Course,
        payload: CourseDuplicate,
        user: CurrentUser,
        *,
        a_svc: AssignmentService | None = None,
    ) -> Course:
        """Deep-copy a course: structure + assignments + grading_config.

        We deliberately do **not** copy: members, owners (other than the
        invoking user), invitations, groups, group_members, deadline extensions,
        or submissions (submissions live elsewhere).
        """
        clone_name = payload.new_name or f"{source.name} (copy)"
        # Slug auto-derived from the clone's name — never user-typed.
        base = await slugify(clone_name, fallback="course")

        async def _taken(s: str) -> bool:
            # Check against the CLONE's tenant (= source.tenant_id), not the
            # acting user's — an admin duplicating a course lives in a
            # different tenant. Include soft-deleted rows: the unique
            # (tenant_id, slug) constraint reserves a slug even after a soft
            # delete, so the check must see them or the INSERT 500s on re-dup.
            res = await self.session.execute(
                select(Course.id)
                .where(Course.tenant_id == source.tenant_id, Course.slug == s)
                .limit(1)
            )
            return res.scalar_one_or_none() is not None

        new_slug = await unique_slug(base, exists=_taken)
        clone = Course(
            tenant_id=source.tenant_id,
            slug=new_slug,
            name=clone_name,
            description=source.description,
            # Archive-only lifecycle — see create_course. "draft" is no
            # longer a valid status (it 500s on serialization).
            status="active",
            start_date=source.start_date,
            end_date=source.end_date,
            owner_id=user.user_id,
            settings=dict(source.settings or {}),
        )
        await self.courses.create(clone, primary_owner_id=user.user_id)

        # Deep-copy assignments + grading configs.
        src_assignments, _ = await self.assignments.list_for_course(source.id, limit=500)
        for src_a in src_assignments:
            clone_a = Assignment(
                course_id=clone.id,
                slug=src_a.slug,
                title=src_a.title,
                description=src_a.description,
                language_hint=src_a.language_hint,
                # Archive-only lifecycle — AssignmentStatus is
                # active|archived; "draft" no longer exists.
                status="active",
                max_score=src_a.max_score,
                weight=src_a.weight,
                deadline_soft_at=src_a.deadline_soft_at,
                deadline_hard_at=src_a.deadline_hard_at,
                late_score_multiplier=src_a.late_score_multiplier,
                selection_strategy=src_a.selection_strategy,
                plagiarism_auto_run=src_a.plagiarism_auto_run,
                plagiarism_threshold=src_a.plagiarism_threshold,
                ai_auto_run=src_a.ai_auto_run,
                ai_prompt_version=src_a.ai_prompt_version,
                external_bindings=list(src_a.external_bindings or []),
            )
            self.session.add(clone_a)
            await self.session.flush()
            src_cfg = await self.assignments.get_grading_config(src_a.id)
            if src_cfg is not None:
                cfg_clone = AssignmentGradingConfig(
                    assignment_id=clone_a.id,
                    rubric=dict(src_cfg.rubric or {}),
                    pass_threshold=src_cfg.pass_threshold,
                    visible_to_students_at=src_cfg.visible_to_students_at,
                )
                self.session.add(cfg_clone)
                await self.session.flush()
            if a_svc is not None:
                await a_svc.publisher.publish_assignment(
                    event_type="plaglens.course.assignment.created.v1",
                    assignment_id=clone_a.id,
                    course_id=clone.id,
                    tenant_id=clone.tenant_id,
                    actor_id=user.user_id,
                    actor_role=user.global_role,
                    data={"slug": clone_a.slug, "duplicated_from": src_a.id},
                )

        await self.publisher.publish_course(
            event_type="plaglens.course.course.created.v1",
            course_id=clone.id,
            tenant_id=clone.tenant_id,
            actor_id=user.user_id,
            actor_role=user.global_role,
            data={
                "slug": clone.slug,
                "duplicated_from": source.id,
                "assignments_copied": len(src_assignments),
            },
        )
        return clone

    # ----- Members / owners --------------------------------------------------------
    async def add_member(
        self, course: Course, payload: MemberCreate, user: CurrentUser
    ) -> CourseMember:
        existing = await self.members.get_member(course.id, payload.user_id)
        if existing is not None:
            raise ProblemException(
                status_code=409, detail="User already a member", code="CONFLICT"
            )
        member = await self.members.add_member(course.id, payload.user_id, payload.role)
        await self.publisher.publish_course(
            event_type="plaglens.course.member.added.v1",
            course_id=course.id,
            tenant_id=course.tenant_id,
            actor_id=user.user_id,
            actor_role=user.global_role,
            data={"user_id": payload.user_id, "role": payload.role},
        )
        return member

    async def batch_add_members(
        self, course: Course, payload: BatchMemberCreate, user: CurrentUser
    ) -> list[CourseMember]:
        added: list[CourseMember] = []
        for entry in payload.members:
            try:
                added.append(await self.add_member(course, entry, user))
            except ProblemException:
                # Skip duplicates; client can re-query the list.
                continue
        return added

    async def update_member_role(
        self, course: Course, member: CourseMember, role: str, user: CurrentUser
    ) -> CourseMember:
        old = member.role
        await self.members.update_role(member, role)
        await self.publisher.publish_course(
            event_type="plaglens.course.member.role_changed.v1",
            course_id=course.id,
            tenant_id=course.tenant_id,
            actor_id=user.user_id,
            actor_role=user.global_role,
            data={"user_id": member.user_id, "old_role": old, "new_role": role},
        )
        return member

    async def remove_member(
        self, course: Course, member: CourseMember, user: CurrentUser
    ) -> None:
        await self.members.remove_member(member)
        await self.publisher.publish_course(
            event_type="plaglens.course.member.removed.v1",
            course_id=course.id,
            tenant_id=course.tenant_id,
            actor_id=user.user_id,
            actor_role=user.global_role,
            data={"user_id": member.user_id},
        )

    async def transfer_member_group(
        self,
        course: Course,
        member: CourseMember,
        target_group_id: int,
        user: CurrentUser,
    ) -> None:
        target = await self.groups.get(course.id, target_group_id)
        if target is None:
            raise ProblemException(
                status_code=404, detail="Target group not found", code="NOT_FOUND"
            )
        # Remove from any other group in this course.
        result = await self.session.execute(
            select(Group).where(Group.course_id == course.id, Group.deleted_at.is_(None))
        )
        for grp in result.scalars():
            if grp.id == target_group_id:
                continue
            existing_member = await self.groups.get_member(grp.id, member.user_id)
            if existing_member is not None:
                await self.groups.remove_member(existing_member)
        if (await self.groups.get_member(target_group_id, member.user_id)) is None:
            await self.groups.add_member(target_group_id, member.user_id)
        await self.publisher.publish_course(
            event_type="plaglens.course.member.role_changed.v1",
            course_id=course.id,
            tenant_id=course.tenant_id,
            actor_id=user.user_id,
            actor_role=user.global_role,
            data={"user_id": member.user_id, "group_id": target_group_id},
        )

    async def add_owner(self, course: Course, user_id: str, user: CurrentUser) -> CourseOwner:
        existing = await self.members.get_owner(course.id, user_id)
        if existing is not None:
            raise ProblemException(
                status_code=409, detail="User already a course owner", code="CONFLICT"
            )
        owner = await self.members.add_owner(course.id, user_id, role="co_owner")
        await self.publisher.publish_course(
            event_type="plaglens.course.member.added.v1",
            course_id=course.id,
            tenant_id=course.tenant_id,
            actor_id=user.user_id,
            actor_role=user.global_role,
            data={"user_id": user_id, "role": "co_owner"},
        )
        return owner

    async def remove_owner(
        self, course: Course, owner: CourseOwner, user: CurrentUser
    ) -> None:
        if owner.role == "owner":
            raise ProblemException(
                status_code=409,
                detail="Primary owner cannot be removed; use :promote first",
                code="CONFLICT",
            )
        await self.members.remove_owner(owner)
        await self.publisher.publish_course(
            event_type="plaglens.course.member.removed.v1",
            course_id=course.id,
            tenant_id=course.tenant_id,
            actor_id=user.user_id,
            actor_role=user.global_role,
            data={"user_id": owner.user_id, "role": "co_owner"},
        )

    async def promote_owner(
        self, course: Course, target_user_id: str, user: CurrentUser
    ) -> Course:
        target = await self.members.get_owner(course.id, target_user_id)
        if target is None:
            raise ProblemException(
                status_code=404, detail="Target is not a course owner", code="NOT_FOUND"
            )
        previous_primary = await self.members.get_owner(course.id, course.owner_id)
        target.role = "owner"
        if previous_primary is not None and previous_primary.user_id != target_user_id:
            previous_primary.role = "co_owner"
        course.owner_id = target_user_id
        await self.session.flush()
        await self.publisher.publish_course(
            event_type="plaglens.course.member.role_changed.v1",
            course_id=course.id,
            tenant_id=course.tenant_id,
            actor_id=user.user_id,
            actor_role=user.global_role,
            data={"new_primary_owner": target_user_id},
        )
        return course

    # ----- Invitations -------------------------------------------------------------
    async def create_invitation(
        self, course: Course, payload: InvitationCreate, user: CurrentUser
    ) -> CourseInvitation:
        for _ in range(8):
            code = _generate_invite_code()
            exists = await self.invitations.get_by_code(code)
            if exists is None:
                break
        else:  # pragma: no cover
            raise ProblemException(
                status_code=500, detail="Failed to allocate invitation code", code="INTERNAL"
            )
        invitation = CourseInvitation(
            course_id=course.id,
            code=code,
            role=payload.role,
            email=payload.email,
            max_uses=payload.max_uses,
            expires_at=payload.expires_at,
            created_by=user.user_id,
        )
        await self.invitations.create(invitation)
        return invitation

    async def consume_invitation(
        self, code: str, user: CurrentUser
    ) -> tuple[CourseInvitation, CourseMember]:
        """Atomically consume an invitation code.

        We coordinate concurrent ``joinByCode`` requests through:

        1. Redis ``INCR`` on key ``inv:{code}:counter`` — fast path; if the
           counter would exceed ``max_uses`` we abort before touching the DB.
        2. PostgreSQL ``SELECT ... FOR UPDATE`` (when on Postgres) on the
           invitation row — keeps DB-level state coherent even without Redis.

        Both fallbacks are best-effort: SQLite (tests) does not honour
        ``FOR UPDATE`` and tests run single-threaded, so the in-process Redis
        fallback is enough.
        """
        invitation = await self.invitations.get_by_code(code)
        if invitation is None or invitation.revoked_at is not None:
            raise ProblemException(
                status_code=404, detail="Invitation not found", code="NOT_FOUND"
            )
        now = datetime.now(tz=UTC)
        if invitation.expires_at is not None and invitation.expires_at < now:
            raise ProblemException(
                status_code=410, detail="Invitation expired", code="GONE"
            )

        # Step 1: Redis INCR for atomic count guard (cluster-safe).
        if self.redis is not None:
            counter_key = f"inv:{code}:counter"
            new_count = await self.redis.incr(counter_key)
            if new_count > invitation.max_uses:
                raise ProblemException(
                    status_code=409,
                    detail="Invitation usage limit reached",
                    code="CONFLICT",
                )

        # Step 2: row lock (PG advisory) — re-read invitation under lock.
        bind = self.session.get_bind()
        if bind.dialect.name == "postgresql":
            stmt = (
                select(CourseInvitation)
                .where(CourseInvitation.id == invitation.id)
                .with_for_update()
            )
            invitation = (await self.session.execute(stmt)).scalar_one()

        if invitation.used_count >= invitation.max_uses:
            raise ProblemException(
                status_code=409, detail="Invitation usage limit reached", code="CONFLICT"
            )

        course = await self.courses.get(invitation.course_id)
        if course is None or course.tenant_id != user.tenant_id:
            raise ProblemException(
                status_code=404, detail="Course not found", code="NOT_FOUND"
            )
        existing = await self.members.get_member(course.id, user.user_id)
        if existing is not None:
            await self.invitations.consume(invitation)
            return invitation, existing
        member = await self.members.add_member(course.id, user.user_id, invitation.role)
        await self.invitations.consume(invitation)
        await self.publisher.publish_course(
            event_type="plaglens.course.member.added.v1",
            course_id=course.id,
            tenant_id=course.tenant_id,
            actor_id=user.user_id,
            actor_role=user.global_role,
            data={"user_id": user.user_id, "role": invitation.role, "via": "code"},
        )
        return invitation, member

    async def bulk_invite(
        self, course: Course, payload: BulkInviteRequest, user: CurrentUser
    ) -> list[CourseInvitation]:
        invitations: list[CourseInvitation] = []
        for email in payload.emails:
            inv = await self.create_invitation(
                course,
                InvitationCreate(role=payload.role, email=email, max_uses=1),
                user,
            )
            invitations.append(inv)
        return invitations

    # ----- Groups ------------------------------------------------------------------
    async def create_group(self, course: Course, payload: GroupCreate) -> Group:
        group = Group(
            course_id=course.id,
            name=payload.name,
            capacity=payload.capacity,
            settings=payload.settings or {},
        )
        try:
            return await self.groups.create(group)
        except IntegrityError as exc:
            raise ProblemException(
                status_code=409, detail="Group name already used", code="CONFLICT"
            ) from exc

    async def update_group(self, group: Group, payload: GroupUpdate) -> Group:
        data = payload.model_dump(exclude_unset=True)
        for field, value in data.items():
            setattr(group, field, value)
        await self.session.flush()
        return group

    async def delete_group(self, group: Group) -> None:
        await self.groups.soft_delete(group)

    async def add_group_member(self, group: Group, user_id: str) -> GroupMember:
        existing = await self.groups.get_member(group.id, user_id)
        if existing is not None:
            return existing
        return await self.groups.add_member(group.id, user_id)

    async def batch_add_group_members(
        self, group: Group, user_ids: Sequence[str]
    ) -> list[GroupMember]:
        rows: list[GroupMember] = []
        for uid in user_ids:
            rows.append(await self.add_group_member(group, uid))
        return rows

    async def remove_group_member(self, member: GroupMember) -> None:
        await self.groups.remove_member(member)

    # ----- Stats / dashboard (stubs) ----------------------------------------------
    async def course_dashboard(self, course: Course) -> dict[str, Any]:
        members, _ = await self.members.list_members(course.id, limit=1)
        assignments, _ = await self.assignments.list_for_course(course.id, limit=1)
        return {
            "course_id": course.id,
            "members_count": len(members),
            "active_assignments": len(assignments),
            "upcoming_deadlines": 0,
            "note": "Proxy to Reporting Service is stubbed (TODO).",
        }
