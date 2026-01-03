"""SQLAlchemy declarative base for audit schema."""
from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase

SCHEMA = "audit"


class Base(DeclarativeBase):
    """Declarative base. Schema is set per-table via __table_args__."""
