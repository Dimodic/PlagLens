"""User repository."""
from __future__ import annotations

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import User


class UserRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.s = session

    async def search_people(
        self, q: str, *, limit: int = 20, offset: int = 0
    ) -> list[User]:
        """Cross-tenant directory search by name/email for the global
        people search + profiles. Substring (ILIKE) match, ranked
        exact → name-prefix → email-prefix → contains; active, non-deleted
        only. (Typo-tolerance via pg_trgm is a planned fast-follow.)"""
        ql = (q or "").strip().lower()
        if not ql:
            return []
        like = f"%{ql}%"
        prefix = f"{ql}%"
        # The DB is LC_CTYPE=C, so plain lower()/ILIKE only fold ASCII —
        # "Смирнов" wouldn't match "смирнов". Fold via the ICU collation
        # (the query side is already Python-lowercased, which IS Unicode-
        # aware) so Cyrillic search works.
        name_l = func.lower(User.display_name.collate("und-x-icu"))
        email_l = func.lower(User.email.collate("und-x-icu"))
        rank = case(
            (name_l == ql, 0),
            (name_l.like(prefix), 1),
            (email_l.like(prefix), 2),
            else_=3,
        )
        stmt = (
            select(User)
            .where(User.deleted_at.is_(None), User.status == "active")
            .where(or_(name_l.like(like), email_l.like(like)))
            .order_by(rank, User.display_name.asc())
            .limit(limit)
            .offset(offset)
        )
        return list((await self.s.execute(stmt)).scalars().all())

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
            # LC_CTYPE=C ⇒ plain ILIKE only folds ASCII case, so a Cyrillic
            # query ("Смирнов") wouldn't match. Fold via the ICU collation —
            # the query side is already Python-lowercased (Unicode-aware) —
            # mirroring ``search_people`` so name/email search works here too.
            ql = q.strip().lower()
            like = f"%{ql}%"
            name_l = func.lower(User.display_name.collate("und-x-icu"))
            email_l = func.lower(User.email.collate("und-x-icu"))
            stmt = stmt.where(or_(name_l.like(like), email_l.like(like)))
        stmt = stmt.order_by(User.created_at.desc()).limit(limit).offset(offset)
        return list((await self.s.execute(stmt)).scalars().all())

    async def add(self, user: User) -> User:
        self.s.add(user)
        await self.s.flush()
        return user
