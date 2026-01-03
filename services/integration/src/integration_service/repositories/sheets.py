"""GoogleSheetsLink repository."""
from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from integration_service.models import GoogleSheetsLink


class GoogleSheetsLinkRepo:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def add(self, link: GoogleSheetsLink) -> GoogleSheetsLink:
        self.session.add(link)
        await self.session.flush()
        return link

    async def get_by_course(self, course_id: str) -> Optional[GoogleSheetsLink]:
        stmt = select(GoogleSheetsLink).where(GoogleSheetsLink.course_id == course_id)
        return (await self.session.execute(stmt)).scalar_one_or_none()

    async def delete(self, link: GoogleSheetsLink) -> None:
        await self.session.delete(link)
        await self.session.flush()
