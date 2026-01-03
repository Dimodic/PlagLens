"""Section L — API Keys for personal/integration usage."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.ids import api_key_id
from ...common.problem import ProblemException
from ...common.security import hash_token, new_opaque_token
from ...deps import CurrentUser, current_user, get_session
from ...models import ApiKey
from ...repositories.api_keys import ApiKeyRepository
from ...schemas.api_keys import ApiKeyCreate, ApiKeyCreated, ApiKeyOut

router = APIRouter(prefix="/users/me/api-keys", tags=["api-keys"])


def _to_out(k: ApiKey) -> ApiKeyOut:
    return ApiKeyOut(
        id=k.id,
        name=k.name,
        scopes=list(k.scopes or []),
        created_at=k.created_at,
        last_used_at=k.last_used_at,
        expires_at=k.expires_at,
        revoked_at=k.revoked_at,
    )


@router.get("", response_model=list[ApiKeyOut], summary="List my API keys")
async def list_api_keys(
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ApiKeyOut]:
    repo = ApiKeyRepository(session)
    return [_to_out(k) for k in await repo.list_for_owner(user.id)]


@router.post(
    "",
    response_model=ApiKeyCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Create API key (plain key returned ONCE)",
)
async def create_api_key(
    payload: ApiKeyCreate,
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> ApiKeyCreated:
    repo = ApiKeyRepository(session)
    plain = new_opaque_token(prefix="pk_")
    key = ApiKey(
        id=api_key_id(),
        owner_user_id=user.id,
        name=payload.name,
        scopes=payload.scopes,
        key_hash=hash_token(plain),
        expires_at=payload.expires_at,
    )
    await repo.add(key)
    return ApiKeyCreated(
        id=key.id,
        name=key.name,
        key=plain,
        scopes=list(key.scopes or []),
        created_at=key.created_at or datetime.now(timezone.utc),
        expires_at=key.expires_at,
    )


@router.delete(
    "/{key_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke API key",
)
async def revoke_api_key(
    key_id: str,
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    repo = ApiKeyRepository(session)
    key = await repo.get(key_id)
    if key is None or key.owner_user_id != user.id:
        raise ProblemException(status=404, code="NOT_FOUND", title="API key not found")
    await repo.revoke(key_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{key_id}:rotate",
    response_model=ApiKeyCreated,
    summary="Rotate API key (revokes old, returns new)",
)
async def rotate_api_key(
    key_id: str,
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> ApiKeyCreated:
    repo = ApiKeyRepository(session)
    old = await repo.get(key_id)
    if old is None or old.owner_user_id != user.id:
        raise ProblemException(status=404, code="NOT_FOUND", title="API key not found")
    await repo.revoke(old.id)
    plain = new_opaque_token(prefix="pk_")
    key = ApiKey(
        id=api_key_id(),
        owner_user_id=user.id,
        name=old.name,
        scopes=list(old.scopes or []),
        key_hash=hash_token(plain),
        expires_at=old.expires_at,
    )
    await repo.add(key)
    return ApiKeyCreated(
        id=key.id,
        name=key.name,
        key=plain,
        scopes=list(key.scopes or []),
        created_at=key.created_at or datetime.now(timezone.utc),
        expires_at=key.expires_at,
    )
