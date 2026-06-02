"""RBAC helpers — translate AuthContext + resource into allow/deny."""
from __future__ import annotations

from submission_service.common.auth import AuthContext
from submission_service.common.problem import ProblemException, forbidden
from submission_service.models.submission import Submission


def ensure_tenant(ctx: AuthContext, tenant_id: str) -> None:
    if ctx.is_admin:
        return
    if ctx.tenant_id != tenant_id:
        raise ProblemException(
            403, "TENANT_MISMATCH", "Tenant Mismatch", "Cross-tenant access denied"
        )


def ensure_course_member(ctx: AuthContext, course_id: str) -> None:
    if ctx.is_admin:
        return
    if not ctx.can_view_course(course_id):
        raise forbidden("Not a member of this course")


def ensure_course_staff(ctx: AuthContext, course_id: str) -> None:
    """Teacher / assistant / owner / co_owner.

    Fallback to global_role when JWT lacks per-course roles — identity-service
    does not yet enrich JWTs with course_roles, so an admin/teacher with empty
    `course_roles` must still be able to manage courses they own."""
    if ctx.can_manage_course(course_id):
        return
    if not ctx.course_roles and _global_can_manage(ctx):
        return
    raise forbidden("Course staff role required")


def _global_can_manage(ctx: AuthContext) -> bool:
    """Fallback when JWT lacks course_roles: trust the global_role."""
    return ctx.global_role in {"owner", "co_owner", "assistant", "teacher"} or ctx.is_admin


def ensure_can_view_submission(ctx: AuthContext, sub: Submission) -> None:
    ensure_tenant(ctx, sub.tenant_id)
    if ctx.can_manage_course(sub.course_id):
        return
    if sub.author_id == ctx.user_id:
        return
    if not ctx.course_roles and _global_can_manage(ctx):
        return
    raise forbidden("Cannot view this submission")


def ensure_can_modify_submission(ctx: AuthContext, sub: Submission) -> None:
    ensure_tenant(ctx, sub.tenant_id)
    if ctx.can_manage_course(sub.course_id):
        return
    if not ctx.course_roles and _global_can_manage(ctx):
        return
    raise forbidden("Course staff role required")


def ensure_can_delete_submission(ctx: AuthContext, sub: Submission) -> None:
    ensure_tenant(ctx, sub.tenant_id)
    if ctx.can_delete_submission(sub.course_id):
        return
    if not ctx.course_roles and ctx.global_role in {"owner", "co_owner", "teacher"}:
        return
    raise forbidden("Owner/co_owner role required")


def ensure_can_create_submission(
    ctx: AuthContext, course_id: str, target_author_id: str | None
) -> None:
    """Teacher/assistant can upload for anyone; student only for themselves.

    Fallback: if the JWT has empty `course_roles` (the identity service does
    not yet enrich JWTs with per-course roles), we honour the user's
    `global_role` so that students can upload their own work and teachers can
    upload for any student. This keeps the authorisation model consistent
    with the rest of the system pending full identity/course integration.
    """
    if ctx.can_manage_course(course_id):
        return
    role = ctx.course_role(course_id)
    if role == "student":
        if target_author_id is None or target_author_id == ctx.user_id:
            return
        raise forbidden("Students can only upload their own submissions")
    # Fallback path: rely on global_role when course_roles is empty.
    if not ctx.course_roles:
        if ctx.global_role in {"owner", "co_owner", "assistant", "teacher"}:
            return
        if ctx.global_role == "student":
            if target_author_id is None or target_author_id == ctx.user_id:
                return
            raise forbidden("Students can only upload their own submissions")
    raise forbidden("Not authorized to create submissions in this course")


def feedback_visible_to(ctx: AuthContext, fb_visible: bool, sub: Submission) -> bool:
    if ctx.can_manage_course(sub.course_id):
        return True
    if sub.author_id == ctx.user_id:
        return fb_visible
    return False
