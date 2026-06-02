"""Telegram account-linking — bind a PlagLens user to their Telegram chat.

Account-linking belongs with identity (alongside OAuthIdentity /
ExternalBinding), so the user ↔ chat binding lives here rather than in the
integration service. The verification-token flow is unchanged from the
former integration implementation:

1. ``POST /users/me/telegram-binding:start`` — the signed-in user asks to
   link. We mint a one-time ``verification_token`` and hand back a
   ``t.me/<bot>?start=<token>`` deep link.
2. The user opens the link; the bot worker receives ``/start <token>`` and
   calls ``POST /users/me/telegram-binding:confirm`` (service-to-service,
   admin/service JWT) with the token + the resolved ``chat_id``. We stamp
   ``bound_at`` and clear the token.
3. ``GET /users/me/telegram-binding`` reports the current state;
   ``DELETE`` unlinks.

Both ``:start`` and ``:confirm`` sit under the ``/api/v1/users`` prefix the
gateway already routes to identity, so no new gateway rule is needed.
"""
from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from ...common.ids import binding_id
from ...common.problem import ProblemException
from ...deps import CurrentUser, current_user, get_session, require_global_role
from ...models import TelegramBinding
from ...repositories.telegram_binding import TelegramBindingRepository
from ...schemas.telegram_binding import (
    TelegramBindingConfirm,
    TelegramBindingOut,
    TelegramBindingStartResponse,
)
from .auth_telegram import _get_bot_credentials

router = APIRouter(prefix="/users/me/telegram-binding", tags=["telegram-binding"])


def _new_token() -> str:
    """One-time binding token — URL-safe, same shape as the prior impl."""
    return secrets.token_urlsafe(24)


@router.post(
    ":start",
    response_model=TelegramBindingStartResponse,
    summary="Begin linking the current user's Telegram account",
)
async def start_binding(
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> TelegramBindingStartResponse:
    repo = TelegramBindingRepository(session)
    creds = _get_bot_credentials()
    bot_username = creds[0] if creds else None

    binding = await repo.get_by_user(user.id)
    token = _new_token()
    if binding is None:
        binding = TelegramBinding(
            id=binding_id(),
            user_id=user.id,
            tenant_id=user.tenant_id,
            verification_token=token,
        )
        await repo.add(binding)
    else:
        # Re-issue: a fresh token supersedes any prior (bound or pending) state.
        binding.verification_token = token
        binding.bound_at = None
        binding.chat_id = None
        binding.username = None
    await session.commit()

    deep_link = (
        f"https://t.me/{bot_username}?start={token}" if bot_username else None
    )
    return TelegramBindingStartResponse(
        verification_token=token,
        bot_username=bot_username,
        deep_link=deep_link,
    )


@router.post(
    ":confirm",
    summary="Confirm a Telegram binding (service-to-service, from the bot worker)",
)
async def confirm_binding(
    payload: TelegramBindingConfirm,
    user: CurrentUser = Depends(require_global_role("admin")),  # noqa: ARG001
    session: AsyncSession = Depends(get_session),
) -> dict[str, Any]:
    """Invoked by the bot worker after ``/start <token>``.

    Guarded by admin/service role — the bot worker authenticates with an
    admin service JWT (``/auth/service-token``), and real admins also pass.
    """
    repo = TelegramBindingRepository(session)
    binding = await repo.get_by_token(payload.verification_token)
    if binding is None:
        raise ProblemException(
            status=404,
            code="NOT_FOUND",
            title="Telegram binding not found",
            detail="Unknown or already-consumed verification token.",
        )
    binding.chat_id = payload.chat_id
    binding.username = payload.username
    binding.bound_at = datetime.now(timezone.utc)
    binding.verification_token = None
    await session.commit()
    return {"ok": True, "user_id": binding.user_id}


@router.get(
    "",
    response_model=TelegramBindingOut,
    summary="Get the current user's Telegram binding state",
)
async def get_my_binding(
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> TelegramBindingOut:
    repo = TelegramBindingRepository(session)
    binding = await repo.get_by_user(user.id)
    if binding is None:
        return TelegramBindingOut(user_id=user.id, bound=False)
    return TelegramBindingOut(
        user_id=binding.user_id,
        chat_id=binding.chat_id,
        username=binding.username,
        bound_at=binding.bound_at,
        bound=binding.bound_at is not None,
    )


@router.delete(
    "",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unlink the current user's Telegram account",
)
async def delete_my_binding(
    user: CurrentUser = Depends(current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    repo = TelegramBindingRepository(session)
    binding = await repo.get_by_user(user.id)
    if binding is None:
        raise ProblemException(
            status=404, code="NOT_FOUND", title="Telegram binding not found"
        )
    await repo.delete(binding)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
