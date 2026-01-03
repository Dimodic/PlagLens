"""Telegram binding schemas."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TelegramBindingStartResponse(BaseModel):
    verification_token: str
    bot_username: Optional[str] = None
    deep_link: Optional[str] = None
    expires_in: int = 600


class TelegramBindingOut(BaseModel):
    user_id: str
    chat_id: Optional[int] = None
    username: Optional[str] = None
    bound_at: Optional[datetime] = None
    bound: bool = False


class TelegramBindingConfirm(BaseModel):
    verification_token: str
    chat_id: int
    username: Optional[str] = None
