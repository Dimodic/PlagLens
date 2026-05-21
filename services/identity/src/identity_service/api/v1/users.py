"""Section G — User management (admin / teacher)."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.events import publish_user_event
from ...common.ids import gen_id, user_id
from ...common.pagination import Page, Pagination
from ...common.problem import ProblemException
from ...common.security import hash_password
from ...deps import (
    CurrentUser,
    assert_same_tenant,
    current_user,
    get_session,
    require_global_role,
)
from ...models import User
from ...repositories.sessions import SessionRepository
from ...repositories.users import UserRepository
from ...schemas.auth import OperationAcceptedOut
from ...schemas.sessions import SessionOut
from ...schemas.users import (
    BulkImportRequest,
    BulkImportResult,
    BulkImportResultItem,
    UserBatchCreate,
    UserCreate,
    UserOut,
    UserUpdate,
)

router = APIRouter(prefix="/users", tags=["users"])


def _user_to_out(u: User) -> UserOut:
    return UserOut(
        id=u.id,
        tenant_id=u.tenant_id,
        email=u.email,
        display_name=u.display_name,
        avatar_url=u.avatar_url,
        locale=u.locale,
        timezone=u.timezone,
        status=u.status,
        global_role=u.global_role,
        email_verified=u.email_verified_at is not None,
        created_at=u.created_at,
        last_login_at=u.last_login_at,
        deleted_at=u.deleted_at,
        anonymized_at=u.anonymized_at,
    )


@router.get("", response_model=Page[UserOut], summary="List users")
async def list_users(
    role: str | None = None,
    status_q: str | None = Query(default=None, alias="status"),
    q: str | None = None,
    tenant_id: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(require_global_role("admin", "teacher")),
    session: AsyncSession = Depends(get_session),
) -> Page[UserOut]:
    repo = UserRepository(session)
    target_tenant = tenant_id if user.global_role == "admin" else user.tenant_id
    rows = await repo.list(
        tenant_id=target_tenant, role=role, status=status_q, q=q, limit=limit, offset=0
    )
    return Page[UserOut](
        data=[_user_to_out(u) for u in rows],
        pagination=Pagination(limit=limit, has_more=False, next_cursor=None),
    )


@router.post(
    "",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a user (admin)",
)
async def create_user(
    payload: UserCreate,
    user: CurrentUser = Depends(require_global_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    repo = UserRepository(session)
    target_tenant = (
        payload.tenant_id if user.global_role == "admin" else user.tenant_id
    )
    if not target_tenant:
        raise ProblemException(
            status=422, code="VALIDATION_FAILED", title="tenant_id is required"
        )
    if await repo.get_by_email(target_tenant, payload.email):
        raise ProblemException(
            status=409, code="CONFLICT", title="Email already exists"
        )
    new = User(
        id=user_id(),
        tenant_id=target_tenant,
        email=payload.email.lower(),
        display_name=payload.display_name,
        global_role=payload.global_role,
        locale=payload.locale,
        timezone=payload.timezone,
        password_hash=hash_password(payload.password) if payload.password else None,
    )
    await repo.add(new)
    return _user_to_out(new)


@router.post(
    ":batchCreate",
    response_model=OperationAcceptedOut,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Bulk-invite users by email list (async)",
)
async def batch_create_users(
    payload: UserBatchCreate,  # noqa: ARG001 — workers consume the payload
    user: CurrentUser = Depends(require_global_role("admin", "teacher")),  # noqa: ARG001
    session: AsyncSession = Depends(get_session),  # noqa: ARG001
) -> OperationAcceptedOut:
    op_id = gen_id("op")
    # TODO: enqueue worker that creates invitations + users.
    return OperationAcceptedOut(
        operation_id=op_id,
        status_url=f"/api/v1/operations/{op_id}",
        metadata={"kind": "user_batch_create"},
    )


@router.get("/{target_user_id}", response_model=UserOut, summary="Get user by id")
async def get_user(
    target_user_id: str,
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    repo = UserRepository(session)
    u = await repo.get(target_user_id)
    if u is None or u.deleted_at is not None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")
    if user.global_role not in ("admin",) and user.id != u.id:
        raise ProblemException(
            status=403, code="FORBIDDEN", title="Insufficient permissions"
        )
    if user.global_role != "admin":
        await assert_same_tenant(user, u.tenant_id)
    return _user_to_out(u)


@router.patch("/{target_user_id}", response_model=UserOut, summary="Update user")
async def update_user(
    target_user_id: str,
    payload: UserUpdate,
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    repo = UserRepository(session)
    u = await repo.get(target_user_id)
    if u is None or u.deleted_at is not None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")
    is_admin = user.global_role in ("admin",)
    if not is_admin and user.id != u.id:
        raise ProblemException(status=403, code="FORBIDDEN", title="Cannot modify other user")
    if user.global_role != "admin":
        await assert_same_tenant(user, u.tenant_id)
    if payload.display_name is not None:
        u.display_name = payload.display_name
    if payload.locale is not None:
        u.locale = payload.locale
    if payload.timezone is not None:
        u.timezone = payload.timezone
    if payload.avatar_url is not None:
        u.avatar_url = payload.avatar_url
    if payload.global_role is not None:
        if not is_admin:
            raise ProblemException(
                status=403, code="FORBIDDEN", title="Only admin can change role"
            )
        u.global_role = payload.global_role
    return _user_to_out(u)


@router.delete(
    "/{target_user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Soft-delete user",
)
async def delete_user(
    target_user_id: str,
    user: CurrentUser = Depends(require_global_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    repo = UserRepository(session)
    u = await repo.get(target_user_id)
    if u is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")
    if user.global_role != "admin":
        await assert_same_tenant(user, u.tenant_id)
    u.deleted_at = datetime.now(timezone.utc)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{target_user_id}:disable",
    response_model=UserOut,
    summary="Disable a user without deleting",
)
async def disable_user(
    target_user_id: str,
    user: CurrentUser = Depends(require_global_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    repo = UserRepository(session)
    u = await repo.get(target_user_id)
    if u is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")
    if user.global_role != "admin":
        await assert_same_tenant(user, u.tenant_id)
    u.status = "disabled"
    return _user_to_out(u)


@router.post(
    "/{target_user_id}:enable",
    response_model=UserOut,
    summary="Re-enable a disabled user",
)
async def enable_user(
    target_user_id: str,
    user: CurrentUser = Depends(require_global_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    repo = UserRepository(session)
    u = await repo.get(target_user_id)
    if u is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")
    if user.global_role != "admin":
        await assert_same_tenant(user, u.tenant_id)
    u.status = "active"
    return _user_to_out(u)


@router.post(
    "/{target_user_id}:anonymize",
    response_model=UserOut,
    summary="GDPR anonymization (irreversible)",
)
async def anonymize_user(
    target_user_id: str,
    request: Request,
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> UserOut:
    repo = UserRepository(session)
    sessions_repo = SessionRepository(session)
    u = await repo.get(target_user_id)
    if u is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")
    if user.global_role not in ("admin",) and user.id != u.id:
        raise ProblemException(
            status=403, code="FORBIDDEN", title="Self or admin only"
        )
    if user.global_role != "admin":
        await assert_same_tenant(user, u.tenant_id)
    h = u.id[-8:]
    u.email = f"anon-{h}@deleted.local"
    u.display_name = "[anonymized]"
    u.password_hash = None
    u.avatar_url = None
    u.anonymized_at = datetime.now(timezone.utc)
    u.status = "disabled"
    # Revoke all sessions before downstream services react to the event.
    await sessions_repo.revoke_all_for_user(u.id)
    # Fan-out: course, submission, ai-analysis, reporting all subscribe to
    # `plaglens.identity.user.v1` and act on `.anonymized.v1` by scrubbing
    # foreign-key references they hold for this user_id.
    await publish_user_event(
        request,
        "identity.user.anonymized.v1",
        data={
            "user_id": u.id,
            "actor_user_id": user.id,
            "self_initiated": user.id == u.id,
        },
        tenant_id=u.tenant_id,
        subject=f"users/{u.id}",
        actor={"user_id": user.id, "global_role": user.global_role},
    )
    return _user_to_out(u)


@router.post(
    "/{target_user_id}:reset-password",
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger a password reset flow for a user",
)
async def admin_reset_password(
    target_user_id: str,
    user: CurrentUser = Depends(require_global_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    repo = UserRepository(session)
    u = await repo.get(target_user_id)
    if u is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")
    if user.global_role != "admin":
        await assert_same_tenant(user, u.tenant_id)
    # TODO: create PasswordResetToken + send email via EmailService
    return Response(status_code=status.HTTP_202_ACCEPTED)


@router.post(
    "/{target_user_id}:force-logout",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke all sessions of a user",
)
async def force_logout_user(
    target_user_id: str,
    user: CurrentUser = Depends(require_global_role("admin")),
    session: AsyncSession = Depends(get_session),
) -> Response:
    repo = UserRepository(session)
    u = await repo.get(target_user_id)
    if u is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")
    if user.global_role != "admin":
        await assert_same_tenant(user, u.tenant_id)
    sessions = SessionRepository(session)
    await sessions.revoke_all_for_user(u.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/{target_user_id}/sessions",
    response_model=Page[SessionOut],
    summary="List active sessions of a user",
)
async def list_user_sessions(
    target_user_id: str,
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Page[SessionOut]:
    repo = UserRepository(session)
    u = await repo.get(target_user_id)
    if u is None:
        raise ProblemException(status=404, code="NOT_FOUND", title="User not found")
    if user.global_role not in ("admin",) and user.id != u.id:
        raise ProblemException(status=403, code="FORBIDDEN", title="Self or admin only")
    sessions = SessionRepository(session)
    rows = await sessions.list_for_user(u.id)
    return Page[SessionOut](
        data=[
            SessionOut(
                id=s.id,
                user_id=s.user_id,
                ip=s.ip,
                user_agent=s.user_agent,
                created_at=s.created_at,
                last_used_at=s.last_used_at,
                expires_at=s.expires_at,
                revoked_at=s.revoked_at,
                is_current=False,
            )
            for s in rows
        ],
        pagination=Pagination(limit=len(rows), has_more=False, next_cursor=None),
    )


# Per-user audit (``GET /api/v1/users/{id}/audit``) is served by the Audit
# Service shortcut route; the gateway routes that suffix straight to audit, so
# identity no longer carries a stub proxy here.


@router.post(
    "/bulk-import",
    response_model=BulkImportResult,
    summary="Bulk-import users from an external system (Yandex.Contest, Stepik, CSV...)",
)
async def bulk_import(
    payload: BulkImportRequest,
    session: AsyncSession = Depends(get_session),
    me: CurrentUser = Depends(current_user),
) -> BulkImportResult:
    """Idempotent: existing users (by email or external_id) are returned as
    ``existing`` without modification. Missing emails are synthesized as
    ``<login>@imported.local`` so the user model invariant holds. Designed
    to be called by the integration-service after pulling participants from
    a remote source."""
    # Resolve target tenant.
    target_tenant_id = payload.tenant_id or me.tenant_id
    # Teachers can bulk-import students into their own tenant (the integration
    # service calls this on their behalf when pulling participants from
    # Yandex.Contest). Admins/super_admins keep full power.
    if me.global_role not in ("admin", "teacher"):
        raise ProblemException(
            status=403, code="FORBIDDEN", title="Teacher / admin role required"
        )
    if me.global_role != "admin" and target_tenant_id != me.tenant_id:
        raise ProblemException(
            status=403,
            code="FORBIDDEN",
            title="Cannot import users into another tenant",
        )

    repo = UserRepository(session)
    out: list[BulkImportResultItem] = []
    created = 0
    existing = 0
    seen_emails: set[str] = set()

    for item in payload.items:
        # Resolve email (synth if missing).
        email = (item.email or "").strip().lower()
        if not email:
            base = (item.login or item.external_id or "user").strip().lower()
            base = "".join(c if c.isalnum() or c in ".-_" else "-" for c in base)
            email = f"{base}@imported.local"
        if email in seen_emails:
            continue  # dedupe within the batch itself
        seen_emails.add(email)

        # Idempotent lookup by email in target tenant.
        existing_user = await repo.get_by_email(target_tenant_id, email)
        if existing_user is not None:
            out.append(
                BulkImportResultItem(
                    user_id=existing_user.id,
                    email=email,
                    action="existing",
                    external_id=item.external_id,
                    login=item.login,
                )
            )
            existing += 1
            continue

        display_name = (
            item.display_name
            or item.login
            or email.split("@")[0]
        )
        new_user = User(
            id=user_id(),
            tenant_id=target_tenant_id,
            email=email,
            email_verified_at=None,  # placeholder users don't have verified email
            password_hash=None,  # they log in via OAuth or invitation later
            display_name=display_name,
            locale="ru",
            timezone="Europe/Moscow",
            status="active",
            global_role=item.global_role or "student",
        )
        session.add(new_user)
        await session.flush()
        out.append(
            BulkImportResultItem(
                user_id=new_user.id,
                email=email,
                action="created",
                external_id=item.external_id,
                login=item.login,
            )
        )
        created += 1

    await session.commit()
    return BulkImportResult(
        tenant_id=target_tenant_id,
        items=out,
        created=created,
        existing=existing,
    )
