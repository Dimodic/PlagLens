"""Section K — Invitations."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.events import publish_user_event
from ...common.ids import invitation_id, user_id
from ...common.invite_code import new_code, normalize_code
from ...common.problem import ProblemException
from ...common.security import hash_password, hash_token, new_opaque_token
from ...deps import (
    CurrentUser,
    assert_same_tenant,
    current_user,
    get_session,
    optional_current_user,
    require_global_role,
)
from ...models import Invitation, User
from ...repositories.invitations import InvitationRepository
from ...repositories.tenants import TenantRepository
from ...repositories.users import UserRepository
from ...schemas.invitations import (
    InvitationAccept,
    InvitationCreate,
    InvitationCreated,
    InvitationOut,
    InvitationRedeem,
    InvitationRedeemResult,
)
from ...services.course_client import (
    CourseClientError,
    CourseMembershipClient,
)
from ...services.email_service import EmailService, build_frontend_url

router = APIRouter(prefix="/invitations", tags=["invitations"])


# Roles an admin can hand out to anyone; teacher can only invite "below" them
# and only into a course they own.
_ADMIN_GRANTABLE_ROLES = frozenset({"teacher", "assistant", "student"})
_TEACHER_GRANTABLE_ROLES = frozenset({"assistant", "student"})


def _to_out(inv: Invitation) -> InvitationOut:
    return InvitationOut(
        id=inv.id,
        tenant_id=inv.tenant_id,
        email=inv.email,
        role=inv.role,
        course_id=inv.course_id,
        code=inv.code,
        expires_at=inv.expires_at,
        accepted_at=inv.accepted_at,
        accepted_by=inv.accepted_by,
        created_at=inv.created_at,
    )


async def _persist_with_unique_code(
    session: AsyncSession, repo: InvitationRepository, inv: Invitation
) -> None:
    """Insert ``inv`` retrying on a code-collision (≤3 attempts).

    The (tenant_id, code) unique index is the only thing that can clash for
    a freshly minted code — bumping into one is astronomically rare with our
    30-char alphabet over 9 positions, but the loop keeps the worst case
    deterministic.
    """
    for _ in range(3):
        try:
            await repo.add(inv)
            return
        except IntegrityError:
            await session.rollback()
            inv.code = new_code()
    # 4th attempt — let the exception propagate if it still collides.
    await repo.add(inv)


@router.post(
    "",
    response_model=InvitationCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Create an invitation (admin / teacher)",
)
async def create_invitation(
    payload: InvitationCreate,
    user: CurrentUser = Depends(require_global_role("admin", "teacher")),
    session: AsyncSession = Depends(get_session),
) -> InvitationCreated:
    # RBAC: which roles can each caller hand out?
    grantable = _ADMIN_GRANTABLE_ROLES if user.global_role == "admin" else _TEACHER_GRANTABLE_ROLES
    if payload.role not in grantable:
        raise ProblemException(
            status=403,
            code="FORBIDDEN",
            title=f"Role '{payload.role}' is not grantable by {user.global_role}",
        )
    # Teacher must target a course (and not a tenant-wide upgrade).
    if user.global_role == "teacher" and not payload.course_id:
        raise ProblemException(
            status=422,
            code="VALIDATION_FAILED",
            title="course_id is required when teacher invites",
        )

    # Cross-tenant: only admin may pin the invite to another tenant. Teachers
    # are always scoped to their own tenant. Default = the caller's tenant.
    if payload.tenant_id and user.global_role != "admin":
        raise ProblemException(
            status=403,
            code="FORBIDDEN",
            title="Only admin can target a different tenant",
        )
    target_tenant_id = payload.tenant_id or user.tenant_id
    if payload.tenant_id and payload.tenant_id != user.tenant_id:
        # Sanity-check the target exists (otherwise we'd produce an orphaned
        # invitation that nobody can redeem).
        tenants_repo = TenantRepository(session)
        tenant_check = await tenants_repo.get(payload.tenant_id)
        if tenant_check is None:
            raise ProblemException(
                status=404, code="NOT_FOUND", title="Target tenant not found"
            )

    repo = InvitationRepository(session)
    plain = new_opaque_token(prefix="inv_")
    email_normalised = payload.email.strip().lower() if payload.email else ""
    inv = Invitation(
        id=invitation_id(),
        tenant_id=target_tenant_id,
        email=email_normalised,
        role=payload.role,
        course_id=payload.course_id,
        token_hash=hash_token(plain),
        code=new_code(),
        expires_at=datetime.now(timezone.utc)
        + timedelta(seconds=payload.expires_in_seconds),
        created_by=user.id,
    )
    await _persist_with_unique_code(session, repo, inv)

    # Resolve a human tenant name for the email — fall back to the slug/id if
    # the row is unexpectedly missing, so we never block creating the invite.
    if email_normalised:
        tenants_repo = TenantRepository(session)
        tenant_row = await tenants_repo.get(target_tenant_id)
        tenant_label = (tenant_row.name if tenant_row else None) or target_tenant_id
        await EmailService().send_invitation_with_code(
            to=email_normalised,
            invite_url=build_frontend_url("/invite", plain),
            tenant_name=tenant_label,
            code=inv.code or "",
            role=inv.role,
        )
    return InvitationCreated(**_to_out(inv).model_dump(), token=plain)


@router.get("", response_model=list[InvitationOut], summary="My invitations")
async def list_invitations(
    user: CurrentUser = Depends(require_global_role("admin", "teacher")),
    session: AsyncSession = Depends(get_session),
) -> list[InvitationOut]:
    repo = InvitationRepository(session)
    rows = await repo.list_for_creator(
        creator_user_id=user.id if user.global_role == "teacher" else None,
        tenant_id=user.tenant_id if user.global_role != "admin" else None,
    )
    return [_to_out(i) for i in rows]


@router.get("/by-token/{token}", response_model=InvitationOut, summary="Inspect by token (public)")
async def invitation_by_token(
    token: str,
    session: AsyncSession = Depends(get_session),
) -> InvitationOut:
    repo = InvitationRepository(session)
    inv = await repo.get_by_token_hash(hash_token(token))
    if inv is None or inv.revoked_at is not None or inv.accepted_at is not None:
        raise ProblemException(status=404, code="NOT_FOUND", title="Invitation not found")
    if inv.expires_at <= datetime.now(timezone.utc).replace(
        tzinfo=inv.expires_at.tzinfo
    ):
        raise ProblemException(status=410, code="GONE", title="Invitation expired")
    return _to_out(inv)


@router.get("/{invitation_id_param}", response_model=InvitationOut, summary="Get invitation")
async def get_invitation(
    invitation_id_param: str,
    user: CurrentUser = Depends(require_global_role("admin", "teacher")),
    session: AsyncSession = Depends(get_session),
) -> InvitationOut:
    repo = InvitationRepository(session)
    inv = await repo.get(invitation_id_param)
    if inv is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="Invitation not found")
    if user.global_role != "admin":
        await assert_same_tenant(user, inv.tenant_id)
    return _to_out(inv)


@router.delete(
    "/{invitation_id_param}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke invitation",
)
async def revoke_invitation(
    invitation_id_param: str,
    user: CurrentUser = Depends(require_global_role("admin", "teacher")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    repo = InvitationRepository(session)
    inv = await repo.get(invitation_id_param)
    if inv is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="Invitation not found")
    if user.global_role != "admin":
        await assert_same_tenant(user, inv.tenant_id)
    await repo.revoke(invitation_id_param)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    ":accept",
    response_model=InvitationOut,
    summary="Accept invitation (public or authenticated)",
)
async def accept_invitation(
    payload: InvitationAccept,
    me: CurrentUser | None = Depends(optional_current_user),
    session: AsyncSession = Depends(get_session),
) -> InvitationOut:
    repo = InvitationRepository(session)
    users = UserRepository(session)
    tenants = TenantRepository(session)
    inv = await repo.get_by_token_hash(hash_token(payload.token))
    if (
        inv is None
        or inv.revoked_at is not None
        or inv.accepted_at is not None
        or inv.expires_at
        <= datetime.now(timezone.utc).replace(tzinfo=inv.expires_at.tzinfo)
    ):
        raise ProblemException(
            status=400, code="BAD_REQUEST", title="Invalid or expired invitation"
        )
    tenant = await tenants.get(inv.tenant_id)
    if tenant is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="Tenant not found")

    if me is not None:
        # Existing user joining (e.g. cross-tenant) — flag accepted; cross-tenant
        # add is out of scope for this stub.
        await repo.mark_accepted(inv.id, me.id)
        # TODO: course-role assignment via Course Service
        return _to_out(inv)

    # Public path — register the user with provided password.
    if not payload.password:
        raise ProblemException(
            status=422,
            code="VALIDATION_FAILED",
            title="Password required for registration",
        )
    existing = await users.get_by_email(inv.tenant_id, inv.email)
    if existing is not None:
        raise ProblemException(
            status=409, code="CONFLICT", title="User already registered"
        )
    new_user = User(
        id=user_id(),
        tenant_id=inv.tenant_id,
        email=inv.email,
        display_name=payload.display_name or inv.email.split("@", 1)[0],
        password_hash=hash_password(payload.password),
        global_role=inv.role if inv.role in {"student", "teacher"} else "student",
    )
    await users.add(new_user)
    await repo.mark_accepted(inv.id, new_user.id)
    return _to_out(inv)


@router.post(
    ":redeem",
    response_model=InvitationRedeemResult,
    summary="Redeem a short invitation code (authenticated user)",
)
async def redeem_invitation(
    payload: InvitationRedeem,
    request: Request,
    me: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> InvitationRedeemResult:
    """Self-service path: an existing user types a code in ``/me`` and the
    server applies the encoded grant.

    * For ``role in {teacher}`` and no ``course_id`` — bumps the user's
      ``global_role`` (cross-tenant promotion is rejected: the invitation
      must belong to the user's own tenant).
    * For any role with a ``course_id`` — calls course-submission to add the
      user as a course member with the matching course-role.
    """
    repo = InvitationRepository(session)
    users = UserRepository(session)
    code = normalize_code(payload.code)
    inv = await repo.get_by_code(me.tenant_id, code)
    if inv is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="Code not found")
    if inv.revoked_at is not None:
        raise ProblemException(status=410, code="GONE", title="Invitation revoked")
    if inv.accepted_at is not None:
        raise ProblemException(status=409, code="CONFLICT", title="Code already used")
    if inv.expires_at <= datetime.now(timezone.utc).replace(tzinfo=inv.expires_at.tzinfo):
        raise ProblemException(status=410, code="GONE", title="Invitation expired")

    # Cross-tenant attempt — we already filter by tenant in the lookup, but be
    # explicit for events / audit clarity.
    if inv.tenant_id != me.tenant_id:
        raise ProblemException(status=403, code="FORBIDDEN", title="Wrong tenant")

    target_user = await users.get(me.id)
    if target_user is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")

    role_applied: str | None = None
    course_id: str | None = inv.course_id
    course_role: str | None = None
    requires_relogin = False

    if inv.course_id:
        # Course membership grant. course_id-bearing invitations always carry
        # an assistant/student role; we forward both to course-submission and
        # let it decide the canonical course-role.
        course_role = inv.role if inv.role in {"assistant", "student", "co_owner", "owner"} else "student"
        try:
            await CourseMembershipClient().add_member(
                course_id=inv.course_id,
                user_id=target_user.id,
                role=course_role,
                tenant_id=target_user.tenant_id,
            )
        except CourseClientError as exc:
            raise ProblemException(
                status=502,
                code="UPSTREAM_UNAVAILABLE",
                title="Course service rejected the join",
                detail=str(exc),
            ) from exc
    elif inv.role == "teacher":
        # Tenant-wide role bump. Only allowed up to teacher; never to admin
        # (those go through the admin role-assign UI, not codes).
        if target_user.global_role in ("admin",):
            # Already at or above — nothing to do but mark used.
            pass
        else:
            target_user.global_role = "teacher"
            role_applied = "teacher"
            requires_relogin = True
    else:
        # role=assistant/student without course_id — not actionable on its own.
        raise ProblemException(
            status=409,
            code="CONFLICT",
            title="This code grants a course role but has no course attached",
        )

    await repo.mark_accepted(inv.id, target_user.id)

    await publish_user_event(
        request,
        "identity.user.invitation_redeemed.v1",
        data={
            "user_id": target_user.id,
            "invitation_id": inv.id,
            "role_applied": role_applied,
            "course_id": course_id,
            "course_role": course_role,
        },
        tenant_id=target_user.tenant_id,
        subject=f"users/{target_user.id}",
    )

    return InvitationRedeemResult(
        invitation_id=inv.id,
        role_applied=role_applied,
        course_id=course_id,
        course_role=course_role,
        requires_relogin=requires_relogin,
    )
