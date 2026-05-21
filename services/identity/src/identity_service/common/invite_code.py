"""Human-readable invitation code generator (``XXX-XXX-XXX``).

The alphabet is A-Z + 2-9 minus the visually-confusable glyphs
``0/O/1/I/L``. With 30 distinct symbols, 9 random positions yield
30**9 ≈ 1.97e13 unique codes — enough that the unique-per-tenant constraint
will not collide in practice within the 7-day default TTL.
"""
from __future__ import annotations

import secrets

ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # 30 chars, ambiguity-free


def new_code() -> str:
    """Return a fresh ``XXX-XXX-XXX`` code."""
    chars = [secrets.choice(ALPHABET) for _ in range(9)]
    return f"{''.join(chars[0:3])}-{''.join(chars[3:6])}-{''.join(chars[6:9])}"


def normalize_code(raw: str) -> str:
    """Strip whitespace, force uppercase, insert dashes if absent.

    Accepts user input from ``/me/redeem`` where humans might type the code
    without dashes, in lowercase, or with extra spaces.
    """
    cleaned = "".join(ch for ch in raw.upper() if ch.isalnum())
    if len(cleaned) != 9:
        return raw.strip().upper()
    return f"{cleaned[0:3]}-{cleaned[3:6]}-{cleaned[6:9]}"
