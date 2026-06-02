"""Prefixed ID helpers."""
from __future__ import annotations

import secrets


def new_id(prefix: str, length: int = 14) -> str:
    return f"{prefix}_{secrets.token_hex(length // 2)}"


def new_config_id() -> str:
    return new_id("ic")


def new_job_id() -> str:
    return new_id("ij")


def new_schedule_id() -> str:
    return new_id("ish")


def new_webhook_event_id() -> str:
    return new_id("we")


def new_sheets_link_id() -> str:
    return new_id("gs")
