"""ID generation helpers."""
from __future__ import annotations

import secrets


def gen_id(prefix: str) -> str:
    """Generate a short URL-safe id with prefix (e.g. ``ana_8b7c1f2d``)."""
    return f"{prefix}_{secrets.token_hex(6)}"
