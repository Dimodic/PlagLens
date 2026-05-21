"""Short prefixed identifiers."""
from __future__ import annotations

import secrets


def _short_id(n_bytes: int = 8) -> str:
    return secrets.token_hex(n_bytes)


def make_id(prefix: str, n_bytes: int = 8) -> str:
    return f"{prefix}_{_short_id(n_bytes)}"


def notification_id() -> str:
    return make_id("ntf")


def delivery_id() -> str:
    return make_id("dlv")


def template_id() -> str:
    return make_id("tpl")


def transport_id() -> str:
    return make_id("etr")


def webpush_id() -> str:
    return make_id("wps")


def bounce_id() -> str:
    return make_id("bnc")


def telegram_cfg_id() -> str:
    return make_id("tgc")
