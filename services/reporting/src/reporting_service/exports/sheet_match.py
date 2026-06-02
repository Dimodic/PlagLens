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

from plaglens_common.errors import NotFoundError, PlagLensError
from plaglens_common.service_client import ServiceClient

from ..config import get_settings


def _upstream_msg(service: str, exc: PlagLensError) -> str:
    """Reproduce the old ``f"{service} {status}: {body}"`` RuntimeError text
    from a ServiceClient ``PlagLensError`` (which carries the mapped status
    and the upstream Problem detail)."""
    return f"{service} {getattr(exc, 'status', 502)}: {exc.detail or ''}"[:220]


_HTTP_TIMEOUT_S = 20.0
_NUM_RE = re.compile(r"\d+")
# Google Sheets' placeholder header for an unlabelled column ("Столбец 1",
# "Column 3", …). These parse to a number and would otherwise hijack a
# ДЗ slot ("ДЗ 1" → "Столбец 1" instead of "Д.З. 1"), so the column
# matcher skips them.
_GENERIC_HDR_RE = re.compile(r"^\s*(столбец|колонка|column|col)\s*\d+\s*$", re.I)

# Header sniffing — a teacher's gradebook rarely starts cleanly at A1: the
# first rows are often a course banner / merged "ДЗ - N" labels, and the
# real header (ФИО / Логин / Итог …) sits a row or two down. We locate it
# by scoring rows on these keyword families rather than assuming row 0.
_NAME_HDR_RE = re.compile(
    r"фио|студент|фамил|\bимя\b|\bф\W*и\W*о\b|name|учащ|учени|курсант", re.I
)
_LOGIN_HDR_RE = re.compile(
    r"логин|login|контест|contest|\bник\b|nickname|handle|аккаунт|account|учет",
    re.I,
)
_LOGIN_FALLBACK_RE = re.compile(r"e-?mail|почт", re.I)
# A per-ДЗ *total* column inside a banner block ("Итог", "∑", "Сумма",
# "Результат", "Оценка", "Балл", …).
_TOTAL_HDR_RE = re.compile(
    r"итог|\bсумм|\bсум\b|результат|оценк|балл|score|total|∑", re.I
)
_GROUP_HDR_RE = re.compile(r"групп|поток|подгруп|№|номер", re.I)
# A homework label carrying a number: "ДЗ 1", "Д.З. 1", "ДЗ - 2",
# "Задание №3", "HW07", "Лаб 4", "Контрольная 1".
_DZ_LABEL_RE = re.compile(
    r"(?:д\s*\.?\s*з|дз|hw|home\s*work|задани\w*|контрольн\w*|лаб\w*)"
    r"\s*[-–—№.:№\s]*(\d+)",
    re.I,
)


def dz_number(text: Any) -> int | None:
    """Homework number from a ДЗ-style label, else ``None``.

    "ДЗ - 1" → 1, "Д.З. 2" → 2, "Задание №3" → 3, "HW07" → 7. A bare
    number ("1", "Столбец 1") returns ``None`` — only labels that *name*
    a homework count, so stray numbers can't hijack a slot."""
    if text is None:
        return None
    m = _DZ_LABEL_RE.search(str(text))
    return int(m.group(1)) if m else None


# A single-letter problem header / title prefix ("A", "A.", "B)"). The
# contest tasks come titled "A. МКАД C++" and the gradebook columns under
# a "ДЗ - N" banner are headed "A", "B", … — matched on this letter.
_LETTER_PREFIX_RE = re.compile(r"^\s*([A-Za-z])\s*[.)\-:]")
_LETTER_ONLY_RE = re.compile(r"^\s*([A-Za-z])\s*$")


def task_letter(title: Any) -> str | None:
    """Leading problem letter of a task title (upper-cased), else ``None``.

    "A. МКАД C++" → "A", "B) Sum" → "B". Used to line a homework's tasks
    up with the "A"…"J" columns of a per-problem gradebook block."""
    if title is None:
        return None
    m = _LETTER_PREFIX_RE.match(str(title))
    return m.group(1).upper() if m else None


def _column_letter(text: Any) -> str | None:
    """A header cell that is a bare single letter ("A", "b ") → upper-cased
    letter, else ``None``."""
    if text is None:
        return None
    m = _LETTER_ONLY_RE.match(str(text))
    return m.group(1).upper() if m else None


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


def normalize_login(s: Any) -> str:
    """Normalise a login / handle for equality matching.

    Unlike :func:`normalize_name` this keeps the punctuation that
    *distinguishes* logins (``ivan.petrov`` ≠ ``ivanpetrov``); it only
    trims, casefolds, drops a leading ``@`` and collapses inner
    whitespace. Я.Контест labels students by their contest login, so the
    sheet's «Логин» column is matched against the student's label here.
    """
    text = unicodedata.normalize("NFKC", str(s or "")).strip().casefold()
    text = text.lstrip("@")
    return re.sub(r"\s+", " ", text)


# ---------------------------------------------------------------------------
# Data fetch — per-(student, homework) totals
# ---------------------------------------------------------------------------


async def build_homework_matrix(
    homework_ids: list[str], bearer_token: str | None
) -> dict[str, Any]:
    """Fetch each homework's assignments + grades, keeping both the
    per-homework total *and* every per-task score.

    Returns ``{homeworks: [{id, title, number, assignments:
    [{id, title, letter, order}]}], students: [{author_id, name,
    totals: {hw_id: float | None}, tasks: {assignment_id: float}}]}``.
    ``totals`` is the sum of a homework's task scores (``None`` when the
    student has no graded task in it); ``tasks`` keeps each graded task's
    score so a per-problem gradebook (columns A…J) can be filled cell by
    cell. ``assignments`` preserve the homework's task order and carry the
    leading problem letter parsed from the title ("A. …" → "A")."""
    if not bearer_token:
        raise RuntimeError(
            "Экспорт оценок запускается интерактивно — нет токена для "
            "обращения к оценкам. Запустите из интерфейса."
        )
    settings = get_settings()
    headers = {"Authorization": bearer_token}

    async with (
        ServiceClient(
            settings.course_service_base_url,
            provider="course",
            timeout=_HTTP_TIMEOUT_S,
        ) as course,
        ServiceClient(
            settings.submission_service_base_url,
            provider="submission",
            timeout=_HTTP_TIMEOUT_S,
        ) as submission,
    ):
        # 1. Homework meta + its assignments (sequential — task order and
        #    the aid→homework grouping matter for per-problem placement).
        hw_meta: list[tuple[str, str, list[dict[str, Any]]]] = []
        for hw_id in homework_ids:
            hid = str(hw_id)
            try:
                hr = await course.get(f"/api/v1/homeworks/{hid}", headers=headers)
                title = str(hr.json().get("title") or f"ДЗ {hid}")
            except PlagLensError:
                # Transport *or* any non-2xx — both fell through to the
                # default title before (the old ``status_code < 400`` guard).
                title = f"ДЗ {hid}"
            try:
                ar = await course.get(
                    f"/api/v1/homeworks/{hid}/assignments",
                    headers=headers,
                    params={"limit": 500},
                )
            except PlagLensError as exc:
                raise RuntimeError(_upstream_msg("course service", exc)) from exc
            assignments = [
                {
                    "id": str(a.get("id")),
                    "title": a.get("title"),
                    "letter": task_letter(a.get("title")),
                    "order": idx,
                }
                for idx, a in enumerate(ar.json().get("data") or [])
            ]
            hw_meta.append((hid, title, assignments))

        aid_to_hw: dict[str, str] = {
            a["id"]: hid for hid, _, assignments in hw_meta for a in assignments
        }
        all_aids = list(aid_to_hw)

        async def _fetch(aid: str) -> list[dict[str, Any]]:
            try:
                gr = await submission.get(
                    f"/api/v1/assignments/{aid}/grades", headers=headers
                )
            except NotFoundError:
                return []
            except PlagLensError as exc:
                raise RuntimeError(
                    _upstream_msg("submission service", exc)
                ) from exc
            payload = gr.json()
            return payload if isinstance(payload, list) else []

        grade_lists = await asyncio.gather(*(_fetch(a) for a in all_aids))

    # 2. Aggregate per (student, homework) and keep per-(student, task).
    names: dict[str, str] = {}
    totals: dict[str, dict[str, float]] = {}
    graded: dict[str, set[str]] = {}
    task_scores: dict[str, dict[str, float]] = {}
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
                task_scores.setdefault(author, {})[aid] = round(float(score), 2)

    homeworks = [
        {
            "id": hid,
            "title": title,
            "number": parse_number(title),
            "assignments": assignments,
        }
        for hid, title, assignments in hw_meta
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
        students.append(
            {
                "author_id": author,
                "name": name,
                "totals": per_hw,
                "tasks": task_scores.get(author, {}),
            }
        )
    return {"homeworks": homeworks, "students": students}


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------


def match_rows(
    students: list[dict[str, Any]],
    name_cells: list[dict[str, Any]],
    login_cells: list[dict[str, Any]] | None = None,
) -> dict[str, int | None]:
    """Map each student's ``author_id`` → a sheet row index.

    Cascade (in order, first hit wins):

    1. **ФИО, exact** — normalised name equals a names-column cell.
    2. **ФИО, token-set** — order-independent word match, so
       "Иванов Иван" lines up with "Иван Иванов".
    3. **Логин** — *if* the sheet has a login/handle column, the
       student's label matched against it. Я.Контест imports label
       students by contest login rather than ФИО, so this fallback
       rescues the rows the name passes can't place.

    ``name_cells`` / ``login_cells`` = ``[{index, text}, …]`` for the
    respective columns (header row excluded). ``login_cells`` is
    optional — omit it for sheets without a login column.
    """
    exact: dict[str, int] = {}
    token_set: dict[frozenset[str], int] = {}
    for cell in name_cells:
        norm = normalize_name(cell.get("text"))
        if not norm:
            continue
        exact.setdefault(norm, int(cell["index"]))
        token_set.setdefault(frozenset(norm.split()), int(cell["index"]))

    login_exact: dict[str, int] = {}
    for cell in login_cells or []:
        lg = normalize_login(cell.get("text"))
        if lg:
            login_exact.setdefault(lg, int(cell["index"]))

    out: dict[str, int | None] = {}
    for st in students:
        label = st.get("name")
        norm = normalize_name(label)
        row = exact.get(norm)
        if row is None and norm:
            row = token_set.get(frozenset(norm.split()))
        if row is None and login_exact:
            row = login_exact.get(normalize_login(label))
        out[st["author_id"]] = row
    return out


def detect_layout(
    rows_grid: list[list[dict[str, Any]]],
    *,
    max_header_scan: int = 12,
    data_sample: int = 80,
) -> dict[str, Any]:
    """Analyse a gradebook's structure instead of assuming A1 is the header.

    Real teacher sheets open with a course banner and/or merged "ДЗ - N"
    labels, with the actual column header (``№ / ФИО / Логин / Итог / …``)
    one or two rows down, and each homework's grade living in a *total*
    column ("Итог" / "∑") inside that ДЗ's banner block. We read the whole
    top of the grid to pin down, deterministically:

    * ``header_row`` — the row scoring highest on header keywords (must
      contain a ФИО- or login-like cell); data begins on the next row.
    * ``name_col`` / ``login_col`` — ФИО and login/handle columns.
    * ``dz_cols`` — ``{homework_number: column}``. Banner pass: for each
      "ДЗ - N" label in a row above the header, take its column span up to
      the next banner and pick the total-keyword column inside it (the one
      with the most filled data cells; e.g. "Итог" over an empty "∑").
      Flat pass: a header cell that is itself a "Д.З. N" label.

    Returns ``header_row``, ``name_col``, ``login_col``, ``dz_cols``,
    ``dz_problem_cols``, ``header_cells`` (the chosen header row) and
    ``name_cells`` / ``login_cells`` (data rows only, header + banners
    excluded) — consumed by :func:`build_placements` / :func:`match_rows`.
    """
    n = len(rows_grid)
    width = max((len(r) for r in rows_grid[: max_header_scan + data_sample]), default=0)

    def val(r: int, c: int) -> Any:
        if 0 <= r < n and c < len(rows_grid[r]):
            return (rows_grid[r][c] or {}).get("v")
        return None

    # 1. Header row — highest keyword score among the first rows; an
    #    identity column (ФИО / login) is mandatory so a banner row of
    #    "ДЗ" labels can't win.
    header_row, best = 0, -1
    for r in range(min(n, max_header_scan)):
        score, has_id = 0, False
        for c in range(len(rows_grid[r])):
            v = val(r, c)
            if v is None or str(v).strip() == "":
                continue
            s = str(v)
            if (
                _NAME_HDR_RE.search(s)
                or _LOGIN_HDR_RE.search(s)
                or _LOGIN_FALLBACK_RE.search(s)
            ):
                has_id = True
                score += 3
            elif _TOTAL_HDR_RE.search(s) or _GROUP_HDR_RE.search(s) or dz_number(s):
                score += 1
        if has_id and score > best:
            best, header_row = score, r

    header = rows_grid[header_row] if header_row < n else []
    header_cells = [
        {"index": i, "text": (c or {}).get("v")} for i, c in enumerate(header)
    ]

    def find_col(rx: re.Pattern[str]) -> int | None:
        for i, c in enumerate(header):
            v = (c or {}).get("v")
            if v is not None and rx.search(str(v)):
                return i
        return None

    name_col = find_col(_NAME_HDR_RE)
    if name_col is None:
        name_col = 0
    login_col = find_col(_LOGIN_HDR_RE)
    if login_col is None:
        login_col = find_col(_LOGIN_FALLBACK_RE)
    if login_col == name_col:
        login_col = None

    # 2. Data rows + per-column fill count (to break "∑" vs "Итог" ties).
    data_start = header_row + 1
    data_rows = rows_grid[data_start : data_start + data_sample]

    def fill_count(c: int) -> int:
        k = 0
        for row in data_rows:
            if c < len(row):
                v = (row[c] or {}).get("v")
                if v not in (None, ""):
                    k += 1
        return k

    # 3a. Banner pass — "ДЗ - N" labels in the rows above the header. For
    #     each block we collect BOTH the per-problem slot columns (A, B, …)
    #     and the total column (Итог / ∑), so the export can fill each task
    #     in its own column and leave the (often formula) total alone.
    dz_cols: dict[int, int] = {}
    dz_problem_cols: dict[int, list[dict[str, Any]]] = {}
    banners: list[tuple[int, int]] = []
    for r in range(header_row):
        for c in range(len(rows_grid[r])):
            num = dz_number(val(r, c))
            if num is not None:
                banners.append((c, num))
    banners.sort()
    for i, (cb, num) in enumerate(banners):
        end = (banners[i + 1][0] - 1) if i + 1 < len(banners) else (width - 1)
        total_cands: list[int] = []
        slots: list[dict[str, Any]] = []
        for c in range(cb, end + 1):
            hv = val(header_row, c)
            if hv is None or str(hv).strip() == "":
                continue
            if _TOTAL_HDR_RE.search(str(hv)):
                total_cands.append(c)
            else:
                # A per-task slot: keep its order + (optional) letter.
                slots.append({"col": c, "letter": _column_letter(hv)})
        if slots:
            dz_problem_cols.setdefault(num, slots)
        if total_cands:
            # The total column the teacher actually fills (most data),
            # tie-broken to the rightmost (final total sits last).
            chosen: int | None = max(total_cands, key=lambda c: (fill_count(c), c))
        elif not slots:
            # Neither slots nor a labelled total — a single-column ДЗ: use
            # the banner column itself if it carries data, else leave it.
            chosen = cb if fill_count(cb) > 0 else None
        else:
            chosen = None
        if chosen is not None:
            dz_cols.setdefault(num, chosen)

    # 3b. Flat pass — "Д.З. N" labels directly in the header row.
    for c in range(len(header)):
        v = (header[c] or {}).get("v")
        if v is None or _GENERIC_HDR_RE.match(str(v)):
            continue
        num = dz_number(v)
        if num is None:
            # Accept a bare number too, but only on a column that isn't an
            # identity / total / group header (so "1" works, "ФИО" doesn't).
            s = str(v)
            if not (
                _NAME_HDR_RE.search(s)
                or _LOGIN_HDR_RE.search(s)
                or _LOGIN_FALLBACK_RE.search(s)
                or _TOTAL_HDR_RE.search(s)
                or _GROUP_HDR_RE.search(s)
            ):
                num = parse_number(v)
        if num is not None:
            dz_cols.setdefault(num, c)

    # 4. Identity cells — data rows only (header + banner rows excluded).
    def col_cells(col: int) -> list[dict[str, Any]]:
        return [
            {
                "index": r,
                "text": val(r, col),
            }
            for r in range(data_start, n)
        ]

    return {
        "header_row": header_row,
        "name_col": name_col,
        "login_col": login_col,
        "dz_cols": dz_cols,
        "dz_problem_cols": dz_problem_cols,
        "header_cells": header_cells,
        "name_cells": col_cells(name_col),
        "login_cells": col_cells(login_col) if login_col is not None else None,
    }


def build_placements(
    matrix: dict[str, Any],
    layout: dict[str, Any],
    row_map: dict[str, int],
) -> dict[str, Any]:
    """Compute the exact cells to fill, the heart of the export.

    For every homework, decide *how* it lands and produce the concrete
    ``(row, col, value)`` cells:

    * **per-task** — the ДЗ block has problem columns (A…J): each task's
      score goes in its own column, matched by the task's letter ("A. …"
      → column "A"); a task whose letter isn't a column falls back to its
      positional slot (1st task → 1st column).
    * **total** — no problem columns (a flat "Д.З. N" / single column):
      the homework's summed score goes in that one column.

    "Итог" / "∑" columns are never written — they're left to the sheet's
    own formulas. Returns ``cells`` (``[{author_id, row, col, value}]``)
    plus a per-homework ``summary`` for the UI.
    """
    dz_problem_cols: dict[int, list[dict[str, Any]]] = layout.get(
        "dz_problem_cols", {}
    )
    dz_cols: dict[int, int] = layout.get("dz_cols", {})

    cells: list[dict[str, Any]] = []
    summary: list[dict[str, Any]] = []
    for hw in matrix["homeworks"]:
        num = hw.get("number")
        assignments = hw.get("assignments") or []
        slots = dz_problem_cols.get(num) if num is not None else None
        mode = "none"
        used_cols: list[int] = []
        placed = 0

        if slots:
            mode = "tasks"
            letter_to_col = {
                s["letter"]: s["col"] for s in slots if s.get("letter")
            }
            for idx, a in enumerate(assignments):
                aid = a["id"]
                col = letter_to_col.get(a.get("letter"))
                if col is None and idx < len(slots):
                    col = slots[idx]["col"]  # positional fallback
                if col is None:
                    continue
                used_cols.append(col)
                for st in matrix["students"]:
                    r = row_map.get(st["author_id"])
                    val = st.get("tasks", {}).get(aid)
                    if r is None or val is None:
                        continue
                    cells.append(
                        {"author_id": st["author_id"], "row": r, "col": col, "value": val}
                    )
                    placed += 1
        elif num is not None and num in dz_cols:
            mode = "total"
            col = dz_cols[num]
            used_cols.append(col)
            for st in matrix["students"]:
                r = row_map.get(st["author_id"])
                val = st.get("totals", {}).get(hw["id"])
                if r is None or val is None:
                    continue
                cells.append(
                    {"author_id": st["author_id"], "row": r, "col": col, "value": val}
                )
                placed += 1

        summary.append(
            {
                "homework_id": hw["id"],
                "title": hw["title"],
                "number": num,
                "mode": mode,
                "columns": sorted(set(used_cols)),
                "task_count": len(assignments),
                "placed_cells": placed,
            }
        )

    return {"cells": cells, "summary": summary}


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
        async with ServiceClient(
            settings.ai_analysis_base_url,
            provider="ai-analysis",
            timeout=25.0,
        ) as client:
            r = await client.post(
                "/api/v1/internal/match-columns",
                json=payload,
                headers={"X-Service-Secret": settings.service_auth_secret},
            )
        raw = (r.json() or {}).get("mapping") or {}
    except (PlagLensError, ValueError):
        # ServiceClient raises PlagLensError on transport *or* non-2xx (was
        # ``httpx.HTTPError`` + the ``status_code >= 400`` guard). ``ValueError``
        # still covers a 2xx body that isn't valid JSON. All best-effort → {}.
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
