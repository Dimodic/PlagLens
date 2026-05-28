"""Section K — Invitations."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.events import publish_user_event
from ...common.ids import binding_id, invitation_id, user_id
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
from ...models import ExternalBinding, Invitation, User
from ...repositories.external_bindings import ExternalBindingRepository
from ...repositories.invitations import InvitationRepository
from ...repositories.tenants import TenantRepository
from ...repositories.users import UserRepository
from ...schemas.invitations import (
    InvitationAccept,
    InvitationBulkBindingItem,
    InvitationBulkBindings,
    InvitationBulkBindingsResult,
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


@router.post(
    ":bulk-bindings",
    response_model=InvitationBulkBindingsResult,
    status_code=status.HTTP_201_CREATED,
    summary="Bulk-mint per-participant claim codes (admin / teacher)",
)
async def bulk_binding_invitations(
    payload: InvitationBulkBindings,
    user: CurrentUser = Depends(require_global_role("admin", "teacher")),
    session: AsyncSession = Depends(get_session),
) -> InvitationBulkBindingsResult:
    """Create one binding-carrying invitation per imported participant.

    Each row is a normal invitation (so the existing ``:redeem`` flow applies)
    but carries ``binding_system`` / ``binding_external_id`` — redeeming it
    links the participant's external identity to the redeemer and backfills
    their imported submissions. Codes never expire in practice (1-year TTL)
    since the teacher hands them out over a term.

    Idempotent on re-run: a participant that already has a live (non-revoked,
    non-accepted) binding-invitation for the same ``(tenant, external_id)``
    reuses that code instead of minting a duplicate.
    """
    repo = InvitationRepository(session)
    bindings_repo = ExternalBindingRepository(session)
    tenant_id_scope = user.tenant_id

    # Pre-load existing live binding-invitations for this tenant so re-runs
    # return the same code instead of spawning duplicates (one query, then a
    # dict lookup per participant).
    existing_rows = await repo.list_binding_invitations(
        tenant_id=tenant_id_scope, binding_system=payload.binding_system
    )
    existing_by_ext: dict[str, Invitation] = {
        r.binding_external_id: r
        for r in existing_rows
        if r.binding_external_id is not None
    }

    items: list[InvitationBulkBindingItem] = []
    for participant in payload.participants:
        prior = existing_by_ext.get(participant.external_id)
        if prior is not None and prior.code:
            items.append(
                InvitationBulkBindingItem(
                    external_id=participant.external_id,
                    display_name=participant.display_name,
                    code=prior.code,
                )
            )
            continue
        # Already linked to a real account? Skip minting — nothing to claim.
        already_bound = await bindings_repo.get_by_external(
            payload.binding_system, participant.external_id
        )
        if already_bound is not None:
            continue
        plain = new_opaque_token(prefix="inv_")
        inv = Invitation(
            id=invitation_id(),
            tenant_id=tenant_id_scope,
            # email is NOT NULL — synthesise a placeholder. No email is sent
            # for binding codes (handed out in person / via the roster UI).
            email="",
            role=payload.role,
            course_id=payload.course_id,
            token_hash=hash_token(plain),
            code=new_code(),
            expires_at=datetime.now(timezone.utc) + timedelta(days=365),
            created_by=user.id,
            binding_system=payload.binding_system,
            binding_external_id=participant.external_id,
        )
        await _persist_with_unique_code(session, repo, inv)
        items.append(
            InvitationBulkBindingItem(
                external_id=participant.external_id,
                display_name=participant.display_name,
                code=inv.code or "",
            )
        )
    return InvitationBulkBindingsResult(items=items)


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
    # Tenant-agnostic lookup so a user sitting in the placeholder «public»
    # tenant (self-registered without an org) can redeem a code that
    # belongs to a real organisation. The cross-tenant decision lives a
    # few lines below — we either migrate the user or reject with 403.
    inv = await repo.get_by_code_global(code)
    if inv is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="Code not found")
    if inv.revoked_at is not None:
        raise ProblemException(status=410, code="GONE", title="Invitation revoked")
    if inv.accepted_at is not None:
        raise ProblemException(status=409, code="CONFLICT", title="Code already used")
    if inv.expires_at <= datetime.now(timezone.utc).replace(tzinfo=inv.expires_at.tzinfo):
        raise ProblemException(status=410, code="GONE", title="Invitation expired")

    target_user = await users.get(me.id)
    if target_user is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")

    role_applied: str | None = None
    course_id: str | None = inv.course_id
    course_role: str | None = None
    requires_relogin = False
    claimed_count: int | None = None

    # Cross-tenant handling: the only legal cross-tenant redeem path is the
    # «self-registered user moves into the inviting organisation» one. The
    # user must currently sit in the default placeholder tenant (slug from
    # ``Settings.default_tenant_slug``). Everything else is 403.
    if inv.tenant_id != target_user.tenant_id:
        from ...config import settings as _settings  # local: avoid top-level cycles

        tenants = TenantRepository(session)
        default_tenant = await tenants.get_by_slug(_settings.default_tenant_slug)
        if (
            default_tenant is None
            or target_user.tenant_id != default_tenant.id
        ):
            raise ProblemException(
                status=403, code="FORBIDDEN", title="Wrong tenant"
            )
        # The destination tenant may already have a different user with the
        # same email (some teacher pre-created them in the org). Refuse the
        # move instead of clobbering; the user must use that account.
        clash = await users.get_by_email(inv.tenant_id, target_user.email)
        if clash is not None and clash.id != target_user.id:
            raise ProblemException(
                status=409,
                code="CONFLICT",
                title="Email already exists in the target organisation",
                detail=(
                    "В этой организации уже есть пользователь с такой почтой. "
                    "Войдите этим аккаунтом и активируйте код повторно."
                ),
            )
        target_user.tenant_id = inv.tenant_id
        # JWT carries tenant_id, so the SPA must re-authenticate to pick up
        # the new tenant. ``requires_relogin`` is the canonical signal the
        # frontend already handles for global-role bumps.
        requires_relogin = True

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
        # An assistant course-grant also confers the platform "assistant"
        # persona. ``assistant`` is a GLOBAL role here — it drives the
        # grading-cabinet shell, the "/" home redirect and the staff
        # submission inbox; a bare course-role row would leave the redeemer
        # stuck in the student UI. Elevate only from ``student`` so we never
        # demote a teacher/admin who happens to assist in another course.
        # The JWT role claim is captured at login, so flag a re-login.
        if course_role == "assistant" and target_user.global_role == "student":
            target_user.global_role = "assistant"
            role_applied = "assistant"
            requires_relogin = True
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
    elif not (inv.binding_system and inv.binding_external_id):
        # role=assistant/student without course_id AND without a binding —
        # not actionable on its own. A binding-only code (external-identity
        # claim) is handled below, so don't reject those here.
        raise ProblemException(
            status=409,
            code="CONFLICT",
            title="This code grants a course role but has no course attached",
        )

    # External-identity binding (e.g. Yandex.Contest participant claim).
    # Runs after any course/role grant so the redeemer is a fully-fledged
    # member first, then we attach the binding and backfill their imports.
    if inv.binding_system and inv.binding_external_id:
        bindings = ExternalBindingRepository(session)
        existing = await bindings.get_by_external(
            inv.binding_system, inv.binding_external_id
        )
        if existing is not None and existing.user_id != target_user.id:
            raise ProblemException(
                status=409,
                code="CONFLICT",
                title="This participant is already linked to another account",
            )
        if existing is None:
            await bindings.add(
                ExternalBinding(
                    id=binding_id(),
                    user_id=target_user.id,
                    system=inv.binding_system,
                    external_id=inv.binding_external_id,
                    display_name=None,
                )
            )
        # else: already bound to THIS user — idempotent, skip re-insert.

        # Backfill the participant's imported submissions to the user. A
        # transport / upstream failure surfaces as 502 so the redeemer can
        # retry (the binding row above is committed with the request, so a
        # retry takes the idempotent path).
        try:
            claimed_count = await CourseMembershipClient().claim_external_submissions(
                user_id=target_user.id,
                tenant_id=target_user.tenant_id,
                external_author_id=inv.binding_external_id,
            )
        except CourseClientError as exc:
            raise ProblemException(
                status=502,
                code="UPSTREAM_UNAVAILABLE",
                title="Course service rejected the submission claim",
                detail=str(exc),
            ) from exc

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
            "binding_system": inv.binding_system,
            "binding_external_id": inv.binding_external_id,
            "claimed_submissions": claimed_count,
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
        claimed_submissions=claimed_count,
    )
