"""Telegram binding schemas (user ↔ Telegram chat)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class TelegramBindingStartResponse(BaseModel):
    verification_token: str
    bot_username: str | None = None
    deep_link: str | None = None
    expires_in: int = 600


class TelegramBindingOut(BaseModel):
    user_id: str
    chat_id: int | None = None
    username: str | None = None
    bound_at: datetime | None = None
    bound: bool = False


class TelegramBindingConfirm(BaseModel):
    verification_token: str
    chat_id: int
    username: str | None = None
