"""User repository."""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import User


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def get(self, user_id: str) -> User | None:
        return await self.s.get(User, user_id)

    async def get_by_email(self, tenant_id: str, email: str) -> User | None:
        stmt = select(User).where(
            User.tenant_id == tenant_id,
            User.email == email.lower(),
            User.deleted_at.is_(None),
        )
        return (await self.s.execute(stmt)).scalar_one_or_none()

    async def find_unique_active_by_email(self, email: str) -> User | None:
        """Return the single active user with this email across all tenants.

        Used by login when ``tenant_slug`` is not supplied. Returns ``None`` if
        no match or multiple matches exist (we don't leak which tenants the
        user exists in — caller treats it as bad credentials).
        """
        stmt = select(User).where(
            User.email == email.lower(),
            User.deleted_at.is_(None),
            User.status == "active",
        ).limit(2)
        rows = (await self.s.execute(stmt)).scalars().all()
        return rows[0] if len(rows) == 1 else None

    async def list(
        self,
        tenant_id: str | None = None,
        role: str | None = None,
        status: str | None = None,
        q: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[User]:
        stmt = select(User).where(User.deleted_at.is_(None))
        if tenant_id:
            stmt = stmt.where(User.tenant_id == tenant_id)
        if role:
            stmt = stmt.where(User.global_role == role)
        if status:
            stmt = stmt.where(User.status == status)
        if q:
            like = f"%{q.lower()}%"
            stmt = stmt.where(User.email.ilike(like) | User.display_name.ilike(like))
        stmt = stmt.order_by(User.created_at.desc()).limit(limit).offset(offset)
        return list((await self.s.execute(stmt)).scalars().all())

    async def add(self, user: User) -> User:
        self.s.add(user)
        await self.s.flush()
        return user
