"""Smart placement of the grade matrix onto a teacher's *existing* Google
Sheet.

The teacher keeps a roster sheet where rows are students and columns are
homeworks ("ДЗ 1", "ДЗ 2", …). Rather than dump a fresh block, we slot
each grade into the cell the teacher already has:

* **Columns** — each ДЗ → the header column carrying its number. The
  number is parsed from the homework title ("ДЗ 3", "Задание №3", "HW3"
  → ``3``) and matched to a header cell whose text parses to the same
  number. Ambiguous / missing matches are left for the optional LLM
  assist (:func:`llm_resolve_columns`, GS5) and then for the teacher to
  fix by hand.
* **Rows** — each student → the row whose name cell matches their ФИО
  (exact normalised match first, then an order-independent token-set
  match so "Иванов Иван" lines up with "Иван Иванов").

Everything is deterministic and side-effect free here; the actual write
lives in the export write path (GS4). This module only *proposes* a
mapping and exposes the aggregated per-(student, homework) values.
"""
from __future__ import annotations

import asyncio
import re
import unicodedata
from typing import Any

import httpx

from ..config import get_settings

_HTTP_TIMEOUT_S = 20.0
_NUM_RE = re.compile(r"\d+")


def parse_number(text: Any) -> int | None:
    """First run of digits in ``text`` as an int, else ``None``.

    "ДЗ 3" → 3, "Задание №12" → 12, "HW07" → 7, "Итого" → None.
    """
    if text is None:
        return None
    m = _NUM_RE.search(str(text))
    return int(m.group()) if m else None


def normalize_name(s: Any) -> str:
    """Casefold, ё→е, strip punctuation, collapse whitespace — so two
    spellings of the same ФИО compare equal."""
    text = unicodedata.normalize("NFKC", str(s or "")).lower().replace("ё", "е")
    text = re.sub(r"[^0-9a-zа-я ]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


# ---------------------------------------------------------------------------
# Data fetch — per-(student, homework) totals
# ---------------------------------------------------------------------------


async def build_homework_matrix(
    homework_ids: list[str], bearer_token: str | None
) -> dict[str, Any]:
    """Fetch each homework's assignments + grades and aggregate to one
    value per (student, homework) = the sum of that homework's task
    scores. Returns ``{homeworks: [{id, title, number}], students:
    [{author_id, name, totals: {hw_id: float | None}}]}`` where a total
    is ``None`` when the student has no graded task in that homework."""
    if not bearer_token:
        raise RuntimeError(
            "Экспорт оценок запускается интерактивно — нет токена для "
            "обращения к оценкам. Запустите из интерфейса."
        )
    settings = get_settings()
    headers = {"Authorization": bearer_token}

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_S) as client:
        # 1. Homework meta + its assignment ids (sequential — order + the
        #    aid→homework grouping matter).
        hw_meta: list[tuple[str, str, list[str]]] = []
        for hw_id in homework_ids:
            hid = str(hw_id)
            try:
                hr = await client.get(
                    f"{settings.course_service_base_url}/api/v1/homeworks/{hid}",
                    headers=headers,
                )
                title = (
                    str(hr.json().get("title") or f"ДЗ {hid}")
                    if hr.status_code < 400
                    else f"ДЗ {hid}"
                )
            except httpx.HTTPError:
                title = f"ДЗ {hid}"
            ar = await client.get(
                f"{settings.course_service_base_url}"
                f"/api/v1/homeworks/{hid}/assignments",
                headers=headers,
                params={"limit": 500},
            )
            if ar.status_code >= 400:
                raise RuntimeError(
                    f"course service {ar.status_code}: {ar.text[:200]}"
                )
            aids = [str(a.get("id")) for a in (ar.json().get("data") or [])]
            hw_meta.append((hid, title, aids))

        aid_to_hw: dict[str, str] = {
            aid: hid for hid, _, aids in hw_meta for aid in aids
        }
        all_aids = list(aid_to_hw)

        async def _fetch(aid: str) -> list[dict[str, Any]]:
            gr = await client.get(
                f"{settings.submission_service_base_url}"
                f"/api/v1/assignments/{aid}/grades",
                headers=headers,
            )
            if gr.status_code == 404:
                return []
            if gr.status_code >= 400:
                raise RuntimeError(
                    f"submission service {gr.status_code}: {gr.text[:200]}"
                )
            payload = gr.json()
            return payload if isinstance(payload, list) else []

        grade_lists = await asyncio.gather(*(_fetch(a) for a in all_aids))

    # 2. Aggregate per (student, homework).
    names: dict[str, str] = {}
    totals: dict[str, dict[str, float]] = {}
    graded: dict[str, set[str]] = {}
    for aid, rows in zip(all_aids, grade_lists, strict=True):
        hid = aid_to_hw[aid]
        for row in rows:
            author = row.get("author_id")
            if not author:
                continue
            names.setdefault(author, row.get("author_label") or author)
            score = row.get("score")
            if score is not None:
                totals.setdefault(author, {}).setdefault(hid, 0.0)
                totals[author][hid] += float(score)
                graded.setdefault(author, set()).add(hid)

    homeworks = [
        {"id": hid, "title": title, "number": parse_number(title)}
        for hid, title, _ in hw_meta
    ]
    students: list[dict[str, Any]] = []
    for author, name in sorted(names.items(), key=lambda kv: kv[1].casefold()):
        per_hw: dict[str, float | None] = {}
        for hid, _, _ in hw_meta:
            per_hw[hid] = (
                round(totals.get(author, {}).get(hid, 0.0), 2)
                if hid in graded.get(author, set())
                else None
            )
        students.append({"author_id": author, "name": name, "totals": per_hw})
    return {"homeworks": homeworks, "students": students}


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------


def match_columns(
    homeworks: list[dict[str, Any]], header_cells: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Map each homework → a header column index by matching ДЗ numbers.

    ``header_cells`` = ``[{index, text}, …]`` for the header row.
    Returns one entry per homework with the chosen ``column_index`` (or
    ``None``), the matched header text, and a ``source``/``confidence``
    so the UI can flag low-confidence guesses for manual review.
    """
    number_to_col: dict[int, int] = {}
    for cell in header_cells:
        n = parse_number(cell.get("text"))
        if n is not None and n not in number_to_col:
            number_to_col[n] = int(cell["index"])
    text_by_col = {int(c["index"]): c.get("text") for c in header_cells}

    out: list[dict[str, Any]] = []
    for hw in homeworks:
        num = hw.get("number")
        col = number_to_col.get(num) if num is not None else None
        out.append(
            {
                "homework_id": hw["id"],
                "title": hw["title"],
                "number": num,
                "column_index": col,
                "header_text": text_by_col.get(col) if col is not None else None,
                "source": "number" if col is not None else "none",
                "confidence": "high" if col is not None else "none",
            }
        )
    return out


def match_rows(
    students: list[dict[str, Any]], name_cells: list[dict[str, Any]]
) -> dict[str, int | None]:
    """Map each student's ``author_id`` → a sheet row index by ФИО.

    ``name_cells`` = ``[{index, text}, …]`` for the names column (header
    excluded). Exact normalised match first; then an order-independent
    token-set match (surname/first-name swaps)."""
    exact: dict[str, int] = {}
    token_set: dict[frozenset[str], int] = {}
    for cell in name_cells:
        norm = normalize_name(cell.get("text"))
        if not norm:
            continue
        exact.setdefault(norm, int(cell["index"]))
        token_set.setdefault(frozenset(norm.split()), int(cell["index"]))

    out: dict[str, int | None] = {}
    for st in students:
        norm = normalize_name(st["name"])
        row = exact.get(norm)
        if row is None and norm:
            row = token_set.get(frozenset(norm.split()))
        out[st["author_id"]] = row
    return out


async def llm_resolve_columns(
    unresolved: list[dict[str, Any]],
    header_cells: list[dict[str, Any]],
    tenant_id: str,
) -> dict[str, int]:
    """Ask ai-analysis (the admin-configured lightweight LLM) to place the
    homeworks the number heuristic couldn't, returning ``{homework_id:
    column_index}`` for any it resolves confidently.

    Best-effort: a missing provider / key / network error / non-JSON
    answer all yield ``{}`` so the heuristic + the teacher's manual
    override remain the source of truth. Never raises."""
    if not unresolved or not header_cells or not tenant_id:
        return {}
    settings = get_settings()
    payload = {
        "tenant_id": tenant_id,
        "homeworks": [
            {"id": u["homework_id"], "title": u.get("title")} for u in unresolved
        ],
        "headers": [
            {"index": c["index"], "text": c.get("text")} for c in header_cells
        ],
    }
    try:
        async with httpx.AsyncClient(timeout=25.0) as client:
            r = await client.post(
                f"{settings.ai_analysis_base_url}/api/v1/internal/match-columns",
                json=payload,
                headers={"X-Service-Secret": settings.service_auth_secret},
            )
        if r.status_code >= 400:
            return {}
        raw = (r.json() or {}).get("mapping") or {}
    except (httpx.HTTPError, ValueError):
        return {}
    valid = {int(c["index"]) for c in header_cells if c.get("index") is not None}
    out: dict[str, int] = {}
    for k, v in raw.items() if isinstance(raw, dict) else []:
        try:
            col = int(v)
        except (TypeError, ValueError):
            continue
        if col in valid:
            out[str(k)] = col
    return out
