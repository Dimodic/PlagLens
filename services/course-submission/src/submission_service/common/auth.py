"""Authentication context: user identity decoded from JWT (or test header)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class AuthContext:
    """Subset of JWT claims needed by the service."""

    user_id: str
    tenant_id: str
    global_role: str = "student"
    course_roles: dict[str, str] = field(default_factory=dict)
    raw: dict[str, Any] = field(default_factory=dict)

    def course_role(self, course_id: str | None) -> str | None:
        if course_id is None:
            return None
        return self.course_roles.get(course_id)

    @property
    def is_super_admin(self) -> bool:
        return self.global_role == "admin"

    @property
    def is_admin(self) -> bool:
        return self.global_role in {"admin"}

    def can_view_course(self, course_id: str) -> bool:
        if self.is_admin:
            return True
        role = self.course_role(course_id)
        return role in {"owner", "co_owner", "assistant", "student"}

    def can_manage_course(self, course_id: str) -> bool:
        """Owner/co_owner/assistant — can create/grade/list submissions."""
        if self.is_admin:
            return True
        return self.course_role(course_id) in {"owner", "co_owner", "assistant"}

    def can_grade(self, course_id: str) -> bool:
        return self.can_manage_course(course_id)

    def can_delete_submission(self, course_id: str) -> bool:
        if self.is_admin:
            return True
        return self.course_role(course_id) in {"owner", "co_owner"}

    def can_delete_grade(self, course_id: str) -> bool:
        if self.is_admin:
            return True
        return self.course_role(course_id) == "owner"
