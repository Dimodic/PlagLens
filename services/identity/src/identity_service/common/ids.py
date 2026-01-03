"""Prefixed ID generation for entities."""
from __future__ import annotations

import uuid


def gen_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:24]}"


def tenant_id() -> str:
    return gen_id("tnt")


def user_id() -> str:
    return gen_id("usr")


def session_id() -> str:
    return gen_id("ses")


def api_key_id() -> str:
    return gen_id("ak")


def invitation_id() -> str:
    return gen_id("inv")


def oauth_id() -> str:
    return gen_id("oid")


def binding_id() -> str:
    return gen_id("bnd")


def token_id() -> str:
    return gen_id("tok")
