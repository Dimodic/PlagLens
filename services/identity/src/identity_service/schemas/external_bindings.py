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


# ---- Yandex.Contest author-id reconciliation (admin/service token) ---- #
class YcRemap(BaseModel):
    """One ``yc:<participantId>`` → ``yc:<login>`` swap."""

    from_external_id: str = Field(min_length=1, max_length=255)
    to_external_id: str = Field(min_length=1, max_length=255)


class YcMigrateRequest(BaseModel):
    """Body of POST /external-bindings:migrate-yc (admin/service token).

    ``tenant_id`` scopes the returned binding list (the join on identity's own
    ``users`` table); the remaps themselves are tenant-agnostic by schema and
    narrowed by ``system='yandex_contest'`` + the from-key.
    """

    tenant_id: str = Field(min_length=1)
    remaps: list[YcRemap] = Field(default_factory=list)


class YcBindingRef(BaseModel):
    """A resolved YC binding for submission's claim pass."""

    external_id: str
    user_id: str


class YcMigrateResult(BaseModel):
    bindings_updated: int
    bindings: list[YcBindingRef] = Field(default_factory=list)
