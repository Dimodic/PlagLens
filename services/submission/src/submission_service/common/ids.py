"""Domain ID generators."""
from __future__ import annotations

import uuid


def _gen(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


def submission_id() -> str:
    return _gen("sub")


def file_id() -> str:
    return _gen("sf")


def feedback_id() -> str:
    return _gen("fb")


def flag_id() -> str:
    return _gen("flg")


def operation_id() -> str:
    return _gen("op")


def event_id() -> str:
    return _gen("evt")
