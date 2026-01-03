"""Slug generation — translate names/titles into readable English slugs.

Slugs are internal / URL-only: users never type or see them. Raw
transliteration ("programmirovanie-na-c") reads badly, so this *translates*
RU→EN with off-the-shelf libraries:

  • ``deep-translator`` — free Google Translate endpoint, no API key, no
    ML models loaded (just an HTTP call), pip-versioned;
  • ``python-slugify`` — normalises the translated text to a clean
    ``[a-z0-9-]`` slug, and is also the offline fallback (it transliterates
    any non-ascii it's handed).

Translation is best-effort and time-boxed: on any failure (offline,
rate-limited, slow) we fall back to slugifying the original text, so
course / assignment / tenant creation never blocks on the translator.

Uniqueness is the caller's job — ``unique_slug`` appends ``-2``, ``-3``…
against a caller-supplied scoped existence check.
"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable

from deep_translator import GoogleTranslator
from slugify import slugify as _ascii_slug

logger = logging.getLogger(__name__)

# Symbol-bearing tech tokens the translator mangles ("C++" → "C").
# Substituted before translation so they survive into the slug intact.
_TECH_SUBSTITUTIONS: tuple[tuple[str, str], ...] = (
    ("C/C++", " cpp "),
    ("c/c++", " cpp "),
    ("C++", " cpp "),
    ("c++", " cpp "),
    ("с++", " cpp "),  # Cyrillic "с"
    ("C#", " csharp "),
    ("c#", " csharp "),
    ("с#", " csharp "),
    ("F#", " fsharp "),
    ("f#", " fsharp "),
    (".NET", " dotnet "),
    (".net", " dotnet "),
)

_MAX_LEN = 60  # tenant slug column is String(64)
_TRANSLATE_TIMEOUT_S = 6.0


def _translate(text: str) -> str:
    """Best-effort RU→EN translation. Returns '' on any failure so the
    caller falls back to transliteration."""
    try:
        out = GoogleTranslator(source="auto", target="en").translate(text)
        return out or ""
    except Exception as exc:  # noqa: BLE001 — translator is best-effort
        logger.warning("slug translation failed, falling back: %s", exc)
        return ""


async def slugify(text: str, *, fallback: str = "item") -> str:
    """Translate ``text`` RU→EN and normalise it into an ``[a-z0-9-]``
    slug. Always returns a non-empty slug — ``fallback`` when the input
    yields nothing usable, a transliterated slug when the translator is
    unreachable or too slow.
    """
    raw = (text or "").strip()
    if not raw:
        return fallback
    for src, dst in _TECH_SUBSTITUTIONS:
        raw = raw.replace(src, dst)

    # deep-translator is sync HTTP — run it off the event loop and
    # time-box it so a slow/hung request can't stall the create flow.
    translated = ""
    try:
        translated = await asyncio.wait_for(
            asyncio.to_thread(_translate, raw),
            timeout=_TRANSLATE_TIMEOUT_S,
        )
    except (TimeoutError, Exception) as exc:  # noqa: BLE001
        logger.warning("slug translation timed out / errored: %s", exc)

    # python-slugify normalises (lowercase, hyphenate, transliterate any
    # remaining non-ascii). If translation failed ``raw`` is slugified
    # directly — still a valid, if transliterated, slug.
    slug = _ascii_slug(translated or raw, max_length=_MAX_LEN, word_boundary=True)
    return slug or fallback


async def unique_slug(
    base: str,
    *,
    exists: Callable[[str], Awaitable[bool]],
) -> str:
    """Append ``-2``, ``-3``… until ``exists(candidate)`` is False.

    ``exists`` is an async predicate the caller wires to the right
    scoped uniqueness check (per-tenant for courses, per-course for
    homeworks / assignments).
    """
    candidate = base
    n = 2
    while await exists(candidate):
        candidate = f"{base}-{n}"
        n += 1
    return candidate
