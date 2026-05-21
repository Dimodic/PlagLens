"""SQLAlchemy declarative base for notification schema."""
from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase

SCHEMA = "notification"


class Base(DeclarativeBase):
    """Declarative base. Schema is set per-table via __table_args__."""
