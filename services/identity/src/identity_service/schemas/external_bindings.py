"""External binding schemas (Stepik / Yandex.Contest)."""
from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ExternalSystem = Literal["stepik", "yandex_contest"]


class ExternalBindingOut(BaseModel):
    id: str
    user_id: str
    system: str
    external_id: str
    display_name: str | None = None
    linked_at: datetime


class ExternalBindingCreate(BaseModel):
    system: ExternalSystem
    external_id: str = Field(min_length=1, max_length=255)
    display_name: str | None = Field(default=None, max_length=255)
