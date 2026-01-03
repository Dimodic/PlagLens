"""Member / owner schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CourseRole = Literal["student", "assistant"]
OwnerRole = Literal["owner", "co_owner"]


class MemberCreate(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)
    role: CourseRole = "student"


class BatchMemberCreate(BaseModel):
    members: list[MemberCreate] = Field(min_length=1, max_length=500)


class BulkInviteRequest(BaseModel):
    # Use a permissive pattern (not strict EmailStr) so test/dummy domains
    # like ``a@x.test`` and reserved-name TLDs pass; the actual email is
    # only used as a label on the invitation row.
    emails: list[str] = Field(min_length=1, max_length=500)
    role: CourseRole = "student"


class BulkInviteResponse(BaseModel):
    invitation_codes: list[str]
    created_count: int


class MemberRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_id: int
    user_id: str
    role: CourseRole
    joined_at: datetime
    removed_at: datetime | None = None


class MemberRoleUpdate(BaseModel):
    role: CourseRole


class MemberTransferGroup(BaseModel):
    target_group_id: int


class OwnerCreate(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)


class OwnerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    course_id: int
    user_id: str
    role: OwnerRole
    assigned_at: datetime
