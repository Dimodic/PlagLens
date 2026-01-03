from __future__ import annotations

import pytest

from plaglens_common.auth import CurrentUser
from plaglens_common.problem import ProblemException
from plaglens_common.rbac import (
    AuthzContext,
    require_course_role,
    require_global_role,
)


def _user(global_role: str = "teacher", **kw: object) -> CurrentUser:
    course_roles_value = kw.get("course_roles") or {}
    return CurrentUser(
        sub="usr_1",
        tenant_id="tnt_1",
        global_role=global_role,
        course_roles=dict(course_roles_value),  # type: ignore[arg-type]
    )


def test_require_global_role_allows_match() -> None:
    @require_global_role("admin")
    def handler(user: CurrentUser) -> str:
        return "ok"

    assert handler(user=_user(global_role="admin")) == "ok"


def test_require_global_role_super_admin_always_allowed() -> None:
    @require_global_role("admin")
    def handler(user: CurrentUser) -> str:
        return "ok"

    assert handler(user=_user(global_role="super_admin")) == "ok"


def test_require_global_role_denies_others() -> None:
    @require_global_role("admin")
    def handler(user: CurrentUser) -> str:
        return "ok"

    with pytest.raises(ProblemException) as ei:
        handler(user=_user(global_role="student"))
    assert ei.value.problem.status == 403


def test_require_course_role_allows_correct_role() -> None:
    @require_course_role("owner", "co_owner")
    def handler(course_id: str, user: CurrentUser) -> str:
        return "ok"

    assert handler("crs_1", user=_user(course_roles={"crs_1": "owner"})) == "ok"


def test_require_course_role_denies_wrong_role() -> None:
    @require_course_role("owner")
    def handler(course_id: str, user: CurrentUser) -> str:
        return "ok"

    with pytest.raises(ProblemException) as ei:
        handler("crs_1", user=_user(course_roles={"crs_1": "assistant"}))
    assert ei.value.problem.status == 403


def test_require_course_role_super_admin_override() -> None:
    @require_course_role("owner")
    def handler(course_id: str, user: CurrentUser) -> str:
        return "ok"

    assert handler("crs_42", user=_user(global_role="super_admin")) == "ok"


def test_require_course_role_tenant_mismatch() -> None:
    @require_course_role("owner")
    def handler(course_id: str, authz: AuthzContext) -> str:
        return "ok"

    user = _user(course_roles={"crs_1": "owner"})
    ctx = AuthzContext(user=user, course_id="crs_1", tenant_id_of_resource="tnt_OTHER")
    with pytest.raises(ProblemException) as ei:
        handler("crs_1", authz=ctx)
    assert ei.value.problem.code == "TENANT_MISMATCH"


def test_authz_context_helpers() -> None:
    user = _user(global_role="teacher", course_roles={"crs_1": "owner"})
    ctx = AuthzContext(user=user, course_id="crs_1")
    assert ctx.has_global_role("teacher", "admin")
    assert ctx.has_course_role("crs_1", "owner")
    assert not ctx.has_course_role("crs_1", "assistant")


def test_unknown_role_raises_value_error() -> None:
    with pytest.raises(ValueError):
        require_global_role("emperor")
