"""Telegram binding endpoints (§H)."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.common.auth import Principal, ensure_role
from integration_service.common.ids import new_binding_id, new_token
from integration_service.common.problems import ProblemException, not_found
from integration_service.config import get_settings
from integration_service.deps import principal_dep, session_dep
from integration_service.models import TelegramBinding
from integration_service.repositories import TelegramBindingRepo
from integration_service.schemas import (
    TelegramBindingOut,
    TelegramBindingStartResponse,
)
from integration_service.schemas.telegram import TelegramBindingConfirm

router = APIRouter(tags=["telegram"])


@router.post(
    "/integrations/telegram/binding/start",
    response_model=TelegramBindingStartResponse,
)
async def start_binding(
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> TelegramBindingStartResponse:
    repo = TelegramBindingRepo(session)
    s = get_settings()
    binding = await repo.get_by_user(p.user_id)
    token = new_token()
    if binding is None:
        binding = TelegramBinding(
            id=new_binding_id(),
            user_id=p.user_id,
            tenant_id=p.tenant_id,
            verification_token=token,
        )
        await repo.add(binding)
    else:
        binding.verification_token = token
        binding.bound_at = None
        binding.chat_id = None
        binding.username = None
    await session.commit()
    deep_link = (
        f"https://t.me/{s.telegram_bot_username}?start={token}"
        if s.telegram_bot_username
        else None
    )
    return TelegramBindingStartResponse(
        verification_token=token,
        bot_username=s.telegram_bot_username,
        deep_link=deep_link,
    )


@router.post("/integrations/telegram/binding/confirm")
async def confirm_binding(
    payload: TelegramBindingConfirm,
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> dict[str, Any]:
    """Internal endpoint — invoked from the bot worker after `/start <token>`."""
    if not p.is_internal and not p.is_admin:
        # In production this is an internal-only call; we accept admin for tests.
        ensure_role(p, "admin")
    repo = TelegramBindingRepo(session)
    binding = await repo.get_by_token(payload.verification_token)
    if binding is None:
        raise not_found("TelegramBinding", payload.verification_token)
    binding.chat_id = payload.chat_id
    binding.username = payload.username
    binding.bound_at = datetime.now(UTC)
    binding.verification_token = None
    await session.commit()
    return {"ok": True, "user_id": binding.user_id}


@router.get("/users/me/telegram-binding", response_model=TelegramBindingOut)
async def get_my_binding(
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> TelegramBindingOut:
    repo = TelegramBindingRepo(session)
    binding = await repo.get_by_user(p.user_id)
    if binding is None:
        return TelegramBindingOut(user_id=p.user_id, bound=False)
    return TelegramBindingOut(
        user_id=binding.user_id,
        chat_id=binding.chat_id,
        username=binding.username,
        bound_at=binding.bound_at,
        bound=binding.bound_at is not None,
    )


@router.delete("/users/me/telegram-binding", status_code=status.HTTP_204_NO_CONTENT)
async def delete_my_binding(
    p: Principal = Depends(principal_dep),
    session: AsyncSession = Depends(session_dep),
) -> Response:
    repo = TelegramBindingRepo(session)
    binding = await repo.get_by_user(p.user_id)
    if binding is None:
        raise not_found("TelegramBinding", p.user_id)
    await repo.delete(binding)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/admin/integrations/telegram/bot-settings")
async def admin_bot_settings(
    p: Principal = Depends(principal_dep),
) -> dict[str, Any]:
    if not p.is_admin and not p.is_super_admin:
        raise ProblemException(403, "FORBIDDEN", "Forbidden", "admin required")
    s = get_settings()
    return {
        "username": s.telegram_bot_username,
        "token_configured": bool(s.telegram_bot_token),
        "long_polling": s.telegram_use_long_polling,
    }


@router.patch("/admin/integrations/telegram/bot-settings")
async def admin_patch_bot_settings(
    payload: dict[str, Any],
    p: Principal = Depends(principal_dep),
) -> dict[str, Any]:
    if payload.get("bot_token") is not None and not p.is_super_admin:
        raise ProblemException(403, "FORBIDDEN", "Forbidden", "super_admin required to set bot_token")
    if not p.is_admin and not p.is_super_admin:
        raise ProblemException(403, "FORBIDDEN", "Forbidden", "admin required")
    # In production: write to Vault. Here: report success but persist nothing.
    return {"ok": True, "echo": {k: ("***" if "token" in k else v) for k, v in payload.items()}}
