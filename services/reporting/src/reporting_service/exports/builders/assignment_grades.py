"""Builder: homework / assignment grades export.

Two modes:

* ``scope.homework_id`` — the primary, teacher-facing path. Produces a
  **per-student grade matrix**: one row per student, one column per
  assignment in the homework, cells hold the score. Teacher grade
  comments ride along as ``cell_notes`` so the ``google_sheets`` format
  can attach them as native cell notes. This path fetches live data over
  HTTP from the course + submission services using the triggering
  teacher's forwarded bearer token (see ``build_dataset``).

* ``scope.assignment_id`` / ``scope.course_id`` — legacy aggregate paths,
  backed by the local Kafka read-models. Kept for back-compat with the
  course-summary-style exports and scheduled exports that have no token.
"""
from __future__ import annotations

import asyncio
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...config import get_settings
from ...models.reporting import AssignmentStats, UserGradesSummary
from .base import BuilderResult

DEFAULT_COLUMNS = [
    "user_id",
    "course_id",
    "assignments_total",
    "submissions_total",
    "average_score",
    "on_time_rate",
    "suspicious_count",
]

STUDENT_COL = "Студент"
TOTAL_COL = "Итого"

# Per-assignment grade fetches run concurrently — a homework has at most a
# few dozen assignments, well under any sane connection cap.
_HTTP_TIMEOUT_S = 20.0


async def build_assignment_grades(
    session: AsyncSession,
    scope: dict[str, Any],
    options: dict[str, Any],
    *,
    bearer_token: str | None = None,
) -> BuilderResult:
    # Scope accepts either ``homework_id`` (single, legacy) or
    # ``homework_ids: [...]`` (new — for the multi-ДЗ export from the
    # export page). Both normalise to a list. Empty → fall back to the
    # legacy aggregate paths.
    raw_ids = scope.get("homework_ids")
    if not raw_ids:
        single = scope.get("homework_id")
        raw_ids = [single] if single else []
    homework_ids = [str(h) for h in raw_ids if h]
    if homework_ids:
        return await _build_homework_matrix(homework_ids, options, bearer_token)
    return await _build_aggregate(session, scope, options)


# ---------------------------------------------------------------------------
# Primary path — live per-student grade matrix for one homework
# ---------------------------------------------------------------------------


async def _build_homework_matrix(
    homework_ids: list[str],
    options: dict[str, Any],
    bearer_token: str | None,
) -> BuilderResult:
    """Fetch ``homework_ids``' assignments + every student's grade, shape
    them into one student×assignment matrix. Columns from multiple ДЗ are
    concatenated left-to-right in the order homeworks were supplied.
    Teacher grade comments ride along as ``cell_notes``."""
    if not bearer_token:
        # Scheduled / tokenless runs can't act as a teacher to read grades.
        raise RuntimeError(
            "Экспорт оценок запускается интерактивно — нет токена для "
            "обращения к оценкам. Запустите экспорт из интерфейса."
        )
    settings = get_settings()
    anonymize = bool(options.get("anonymize", False))
    headers = {"Authorization": bearer_token}

    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_S) as client:
        # 1. Per-homework meta — title (cosmetic, for the export title)
        #    AND its assignment list (stable order matters → sequential).
        homework_titles: list[str] = []
        assignment_cols: list[tuple[str, str]] = []
        seen_labels: set[str] = set()
        for hw_id in homework_ids:
            try:
                hr = await client.get(
                    f"{settings.course_service_base_url}"
                    f"/api/v1/homeworks/{hw_id}",
                    headers=headers,
                )
                hw_title = (
                    str(hr.json().get("title") or f"ДЗ {hw_id}")
                    if hr.status_code < 400
                    else f"ДЗ {hw_id}"
                )
            except httpx.HTTPError:
                hw_title = f"ДЗ {hw_id}"
            homework_titles.append(hw_title)

            ar = await client.get(
                f"{settings.course_service_base_url}"
                f"/api/v1/homeworks/{hw_id}/assignments",
                headers=headers,
                params={"limit": 500},
            )
            if ar.status_code >= 400:
                raise RuntimeError(
                    f"course service {ar.status_code}: {ar.text[:200]}"
                )
            raw_assignments = ar.json().get("data", []) or []
            for a in raw_assignments:
                aid = str(a.get("id"))
                title = str(a.get("title") or aid).strip() or aid
                # Column labels are de-duplicated tenant-wide (two
                # different ДЗ may have an "A. Задача" each — append a
                # numeric suffix so the row dict keys don't collide).
                label = title
                n = 2
                while label in seen_labels:
                    label = f"{title} ({n})"
                    n += 1
                seen_labels.add(label)
                assignment_cols.append((aid, label))

        # 2. Per-assignment grades, fetched concurrently across all
        #    homeworks at once.
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

        grade_lists = await asyncio.gather(
            *(_fetch(aid) for aid, _ in assignment_cols)
        )

    # 4. Index: author_id → display label, and (author, column) → score /
    #    comment. ``author_label`` is the human name; falls back to the id.
    students: dict[str, str] = {}
    score_by: dict[str, dict[str, float]] = {}
    comment_by: dict[str, dict[str, str]] = {}
    for (_, col), rows in zip(assignment_cols, grade_lists, strict=False):
        for row in rows:
            author_id = row.get("author_id")
            if not author_id:
                continue
            students.setdefault(
                author_id, row.get("author_label") or author_id
            )
            score = row.get("score")
            if score is not None:
                score_by.setdefault(author_id, {})[col] = float(score)
            comment = row.get("comment")
            if comment:
                comment_by.setdefault(author_id, {})[col] = str(comment)

    # 5. Rows — one per student, sorted by display name.
    ordered = sorted(students.items(), key=lambda kv: kv[1].casefold())
    columns = [STUDENT_COL] + [label for _, label in assignment_cols] + [TOTAL_COL]
    rows: list[dict[str, Any]] = []
    cell_notes: list[dict[str, Any]] = []
    for idx, (author_id, name) in enumerate(ordered):
        row: dict[str, Any] = {
            STUDENT_COL: f"Студент {idx + 1:03d}" if anonymize else name
        }
        total = 0.0
        graded_any = False
        for _, col in assignment_cols:
            score = score_by.get(author_id, {}).get(col)
            row[col] = score if score is not None else ""
            if score is not None:
                total += score
                graded_any = True
            # Comments can carry the student's name / identifying detail —
            # drop them entirely when the export is anonymised.
            if not anonymize:
                comment = comment_by.get(author_id, {}).get(col)
                if comment:
                    cell_notes.append(
                        {"row": idx, "column": col, "note": comment}
                    )
        row[TOTAL_COL] = round(total, 2) if graded_any else ""
        rows.append(row)

    # Title: one ДЗ → its name; multiple → join with " + ", but cap so
    # the export filename / Sheets tab title doesn't bloat.
    if len(homework_titles) == 1:
        title = f"Оценки — {homework_titles[0]}"
    else:
        joined = " + ".join(homework_titles)
        title = (
            f"Оценки — {joined}"
            if len(joined) <= 80
            else f"Оценки — {len(homework_titles)} ДЗ"
        )
    return BuilderResult(
        title=title,
        columns=columns,
        rows=rows,
        metadata={
            "homework_ids": homework_ids,
            "students": len(rows),
            "assignments": len(assignment_cols),
            "comments": len(cell_notes),
        },
        cell_notes=cell_notes,
    )


# ---------------------------------------------------------------------------
# Legacy aggregate paths — local read-models, no HTTP, no token
# ---------------------------------------------------------------------------


async def _build_aggregate(
    session: AsyncSession, scope: dict[str, Any], options: dict[str, Any]
) -> BuilderResult:
    course_id = str(scope.get("course_id", ""))
    assignment_id = str(scope.get("assignment_id", ""))
    columns = options.get("include_columns") or DEFAULT_COLUMNS
    anonymize = bool(options.get("anonymize", False))

    rows: list[dict[str, Any]] = []
    flags: list[dict[str, str]] = []

    if assignment_id:
        a = await session.get(AssignmentStats, assignment_id)
        if a is not None:
            rows.append(
                {
                    "assignment_id": a.assignment_id,
                    "course_id": a.course_id,
                    "submissions_count": a.submissions_count,
                    "students_submitted_count": a.students_submitted_count,
                    "on_time_count": a.on_time_count,
                    "late_soft_count": a.late_soft_count,
                    "late_hard_count": a.late_hard_count,
                    "average_score": round(a.average_score, 2),
                    "max_similarity": round(a.max_similarity, 2),
                    "suspicious_count": a.suspicious_count,
                    "ai_completed_count": a.ai_completed_count,
                }
            )
            columns = list(rows[0].keys())
    elif course_id:
        stmt = select(UserGradesSummary).where(UserGradesSummary.course_id == course_id)
        results = (await session.execute(stmt)).scalars().all()
        for idx, r in enumerate(results):
            on_time_rate = (r.on_time_count / r.on_time_total) if r.on_time_total else 0.0
            row = {
                "user_id": f"student_{idx + 1:03d}" if anonymize else r.user_id,
                "course_id": r.course_id,
                "assignments_total": r.assignments_total,
                "submissions_total": r.submissions_total,
                "average_score": round(r.average_score, 2),
                "on_time_rate": round(on_time_rate, 3),
                "suspicious_count": r.suspicious_count,
            }
            rows.append({k: row[k] for k in columns if k in row})
            if r.suspicious_count > 0:
                flags.append({"row": str(idx), "column": "suspicious_count", "level": "warn"})

    return BuilderResult(
        title="Assignment Grades" if assignment_id else "Course Grades",
        columns=columns,
        rows=rows,
        metadata={"course_id": course_id, "assignment_id": assignment_id},
        cell_flags=flags,
    )
