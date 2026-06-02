"""Telegram binding repository (user ↔ Telegram chat)."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import TelegramBinding


class TelegramBindingRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def add(self, binding: TelegramBinding) -> TelegramBinding:
        self.s.add(binding)
        await self.s.flush()
        return binding

    async def get_by_user(self, user_id: str) -> TelegramBinding | None:
        stmt = select(TelegramBinding).where(TelegramBinding.user_id == user_id)
        return (await self.s.execute(stmt)).scalar_one_or_none()

    async def get_by_token(self, token: str) -> TelegramBinding | None:
        stmt = select(TelegramBinding).where(
            TelegramBinding.verification_token == token
        )
        return (await self.s.execute(stmt)).scalar_one_or_none()

    async def get_by_chat(self, chat_id: int) -> TelegramBinding | None:
        stmt = select(TelegramBinding).where(TelegramBinding.chat_id == chat_id)
        return (await self.s.execute(stmt)).scalar_one_or_none()

    async def delete(self, binding: TelegramBinding) -> None:
        await self.s.delete(binding)
        await self.s.flush()
