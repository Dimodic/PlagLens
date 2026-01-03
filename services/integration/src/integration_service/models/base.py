"""SQLAlchemy declarative base bound to integration schema."""
from __future__ import annotations

from sqlalchemy import MetaData
from sqlalchemy.orm import DeclarativeBase

INTEGRATION_SCHEMA = "integration"

metadata = MetaData(schema=INTEGRATION_SCHEMA)


class Base(DeclarativeBase):
    metadata = metadata
