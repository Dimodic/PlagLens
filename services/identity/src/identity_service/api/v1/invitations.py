"""Section K — Invitations."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.ids import invitation_id, user_id
from ...common.problem import ProblemException
from ...common.security import hash_password, hash_token, new_opaque_token
from ...deps import (
    CurrentUser,
    assert_same_tenant,
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
)
from ...services.email_service import EmailService, build_frontend_url

router = APIRouter(prefix="/invitations", tags=["invitations"])


def _to_out(inv: Invitation) -> InvitationOut:
    return InvitationOut(
        id=inv.id,
        tenant_id=inv.tenant_id,
        email=inv.email,
        role=inv.role,
        course_id=inv.course_id,
        expires_at=inv.expires_at,
        accepted_at=inv.accepted_at,
        accepted_by=inv.accepted_by,
        created_at=inv.created_at,
    )


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
    repo = InvitationRepository(session)
    plain = new_opaque_token(prefix="inv_")
    inv = Invitation(
        id=invitation_id(),
        tenant_id=user.tenant_id,
        email=payload.email.lower(),
        role=payload.role,
        course_id=payload.course_id,
        token_hash=hash_token(plain),
        expires_at=datetime.now(timezone.utc)
        + timedelta(seconds=payload.expires_in_seconds),
        created_by=user.id,
    )
    await repo.add(inv)
    # Resolve a human tenant name for the email — fall back to the slug/id if
    # the row is unexpectedly missing, so we never block creating the invite.
    tenants_repo = TenantRepository(session)
    tenant_row = await tenants_repo.get(user.tenant_id)
    tenant_label = (tenant_row.name if tenant_row else None) or user.tenant_id
    await EmailService().send_invitation(
        to=inv.email,
        invite_url=build_frontend_url("/invite", plain),
        tenant_name=tenant_label,
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
