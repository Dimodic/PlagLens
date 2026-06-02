"""Section G: telegram bot config (admin)."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from notification_service.db import get_db
from notification_service.ids import telegram_cfg_id
from notification_service.models import TelegramBotConfig
from notification_service.schemas import (
    TelegramConfigOut,
    TelegramConfigPatch,
    TelegramSetWebhookBody,
)
from notification_service.security import Principal, require_admin

router = APIRouter(tags=["admin-telegram"])


async def _get_or_create(db: AsyncSession) -> TelegramBotConfig:
    stmt = select(TelegramBotConfig).limit(1)
    res = await db.execute(stmt)
    cfg = res.scalars().first()
    if cfg is not None:
        return cfg
    cfg = TelegramBotConfig(id=telegram_cfg_id())
    db.add(cfg)
    await db.flush()
    return cfg


def _to_out(cfg: TelegramBotConfig) -> TelegramConfigOut:
    return TelegramConfigOut(
        id=cfg.id,
        bot_username=cfg.bot_username,
        webhook_url=cfg.webhook_url,
        token_present=bool(cfg.token_secret_ref),
        updated_at=cfg.updated_at,
    )


@router.get("/admin/notifications/telegram-config", response_model=TelegramConfigOut)
async def get_tg_config(
    _: Principal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> TelegramConfigOut:
    cfg = await _get_or_create(db)
    return _to_out(cfg)


@router.patch("/admin/notifications/telegram-config", response_model=TelegramConfigOut)
async def patch_tg_config(
    body: TelegramConfigPatch,
    _: Principal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> TelegramConfigOut:
    cfg = await _get_or_create(db)
    if body.token_secret_ref is not None:
        cfg.token_secret_ref = body.token_secret_ref
    if body.bot_username is not None:
        cfg.bot_username = body.bot_username
    cfg.updated_at = datetime.now(UTC)
    return _to_out(cfg)


@router.post(
    "/admin/notifications/telegram-config:set-webhook", response_model=TelegramConfigOut
)
async def set_webhook(
    body: TelegramSetWebhookBody,
    _: Principal = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> TelegramConfigOut:
    cfg = await _get_or_create(db)
    cfg.webhook_url = body.webhook_url
    cfg.updated_at = datetime.now(UTC)
    # Real impl would call Telegram setWebhook here.
    return _to_out(cfg)


_ = Any  # noqa: F841
