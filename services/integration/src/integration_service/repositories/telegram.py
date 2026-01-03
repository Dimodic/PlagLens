"""TelegramBinding repository."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.models import TelegramBinding


class TelegramBindingRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, b: TelegramBinding) -> TelegramBinding:
        self.session.add(b)
        await self.session.flush()
        return b

    async def get_by_user(self, user_id: str) -> Optional[TelegramBinding]:
        stmt = select(TelegramBinding).where(TelegramBinding.user_id == user_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def get_by_token(self, token: str) -> Optional[TelegramBinding]:
        stmt = select(TelegramBinding).where(TelegramBinding.verification_token == token)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def get_by_chat(self, chat_id: int) -> Optional[TelegramBinding]:
        stmt = select(TelegramBinding).where(TelegramBinding.chat_id == chat_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def delete(self, b: TelegramBinding) -> None:
        await self.session.delete(b)
        await self.session.flush()
