"""Section I — External bindings (Stepik / Yandex.Contest user mappings)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.ids import binding_id
from ...common.problem import ProblemException
from ...deps import (
    CurrentUser,
    assert_same_tenant,
    current_user,
    get_session,
)
from ...models import ExternalBinding
from ...repositories.external_bindings import ExternalBindingRepository
from ...repositories.users import UserRepository
from ...schemas.external_bindings import ExternalBindingCreate, ExternalBindingOut

router = APIRouter(prefix="/users/{target_user_id}/external-bindings", tags=["bindings"])


def _to_out(b: ExternalBinding) -> ExternalBindingOut:
    return ExternalBindingOut(
        id=b.id,
        user_id=b.user_id,
        system=b.system,
        external_id=b.external_id,
        display_name=b.display_name,
        linked_at=b.linked_at,
    )


def _resolve_target(user: CurrentUser, target_user_id: str) -> str:
    """Allow the literal `me` as a self-reference."""
    if target_user_id == "me":
        return user.id
    return target_user_id


async def _ensure_self_or_admin(
    user: CurrentUser, target_user_id: str, session: AsyncSession
) -> None:
    if user.global_role in ("admin",):
        if user.global_role != "admin":
            users = UserRepository(session)
            target = await users.get(target_user_id)
            if target is None:
                raise ProblemException(
                    status=404, code="NOT_FOUND", title="User not found"
                )
            await assert_same_tenant(user, target.tenant_id)
        return
    if user.id != target_user_id:
        raise ProblemException(
            status=403, code="FORBIDDEN", title="Self or admin required"
        )


@router.get("", response_model=list[ExternalBindingOut], summary="List bindings")
async def list_bindings(
    target_user_id: str,
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ExternalBindingOut]:
    target_user_id = _resolve_target(user, target_user_id)
    await _ensure_self_or_admin(user, target_user_id, session)
    repo = ExternalBindingRepository(session)
    return [_to_out(b) for b in await repo.list_for_user(target_user_id)]


@router.post(
    "",
    response_model=ExternalBindingOut,
    status_code=status.HTTP_201_CREATED,
    summary="Add a binding",
)
async def add_binding(
    target_user_id: str,
    payload: ExternalBindingCreate,
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> ExternalBindingOut:
    target_user_id = _resolve_target(user, target_user_id)
    await _ensure_self_or_admin(user, target_user_id, session)
    repo = ExternalBindingRepository(session)
    b = ExternalBinding(
        id=binding_id(),
        user_id=target_user_id,
        system=payload.system,
        external_id=payload.external_id,
        display_name=payload.display_name,
    )
    await repo.add(b)
    return _to_out(b)


@router.delete(
    "/{binding_id_param}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a binding",
)
async def delete_binding(
    target_user_id: str,
    binding_id_param: str,
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    target_user_id = _resolve_target(user, target_user_id)
    await _ensure_self_or_admin(user, target_user_id, session)
    repo = ExternalBindingRepository(session)
    deleted = await repo.delete(binding_id_param)
    if not deleted:
        raise ProblemException(status=404, code="NOT_FOUND", title="Binding not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
