"""Google Sheets sync via google-api-python-client.

Production path uses ``service_account.Credentials.from_service_account_info``
+ ``spreadsheets().batchUpdate``. For tests, a ``GoogleSheetsClient`` protocol
is exposed that an in-memory mock can satisfy.

Two responsibilities:

* **Write** — push a :class:`BuilderResult` matrix into a target spreadsheet.
  Supports an *anchor cell* (e.g. ``B5``) so teachers can drop the grades
  block anywhere on the sheet via the interactive picker, not just A1.
  Teacher grade comments ride along via ``BuilderResult.cell_notes`` and
  land as native Google Sheets *notes* (the corner-triangle hover).

* **Read / preview** — fetch the spreadsheet's current contents (all
  worksheets, cell values + notes, capped at ``max_rows × max_cols``) so
  the UI can render an interactive grid where the teacher drags out the
  destination region.

Anchors and notes
-----------------
Notes are sheet-addressed by ``(sheetId, row, col)``. ``updateCells``
needs the numeric sheet id, so the real client first resolves the sheet
title → id via ``spreadsheets().get``. Notes are best-effort: if that
second call fails the values are already in the sheet.
"""
from __future__ import annotations

import asyncio
import re
from datetime import datetime
from typing import Any, Protocol

from ..builders.base import BuilderResult

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def parse_a1(reference: str) -> tuple[int, int]:
    """Parse an A1-style cell reference like ``B5`` or ``B5:K20`` and return
    the top-left as ``(row, col)`` 0-indexed.

    ``A1`` → ``(0, 0)``, ``B5`` → ``(4, 1)``, ``AA1`` → ``(0, 26)``.
    """
    head = reference.strip().split(":", 1)[0]
    m = re.match(r"^([A-Za-z]+)(\d+)$", head)
    if not m:
        raise ValueError(f"Invalid A1 reference: {reference!r}")
    letters, digits = m.groups()
    col = 0
    for ch in letters.upper():
        col = col * 26 + (ord(ch) - ord("A") + 1)
    return int(digits) - 1, col - 1


def col_to_letters(col: int) -> str:
    """0-indexed column → spreadsheet letters. ``0`` → ``A``, ``26`` → ``AA``."""
    letters = ""
    n = col + 1
    while n > 0:
        n, rem = divmod(n - 1, 26)
        letters = chr(ord("A") + rem) + letters
    return letters


def a1_of(row: int, col: int) -> str:
    """0-indexed ``(row, col)`` → A1 reference. ``(4, 1)`` → ``B5``."""
    return f"{col_to_letters(col)}{row + 1}"


# ---------------------------------------------------------------------------
# Client protocol + impls
# ---------------------------------------------------------------------------


class GoogleSheetsClient(Protocol):
    async def batch_update(
        self,
        spreadsheet_id: str,
        sheet_title: str,
        values: list[list[Any]],
        notes: list[dict[str, Any]] | None = None,
        anchor: str = "A1",
    ) -> dict[str, Any]: ...

    async def fetch_preview(
        self,
        spreadsheet_id: str,
        *,
        max_rows: int = 200,
        max_cols: int = 40,
    ) -> dict[str, Any]: ...

    async def write_cells(
        self,
        spreadsheet_id: str,
        sheet_title: str,
        cells: list[dict[str, Any]],
    ) -> dict[str, Any]: ...


class InMemoryGoogleSheetsClient:
    """Mock client used in tests."""

    def __init__(self) -> None:
        self.spreadsheets: dict[str, dict[str, list[list[Any]]]] = {}
        # spreadsheet_id → sheet_title → list of {row, col, note}
        self.notes: dict[str, dict[str, list[dict[str, Any]]]] = {}
        # Records the anchors used per (spreadsheet, sheet) so tests can
        # assert the writer honoured them.
        self.anchors: dict[str, dict[str, str]] = {}
        self.last_sync_at: dict[str, datetime] = {}

    async def batch_update(
        self,
        spreadsheet_id: str,
        sheet_title: str,
        values: list[list[Any]],
        notes: list[dict[str, Any]] | None = None,
        anchor: str = "A1",
    ) -> dict[str, Any]:
        self.spreadsheets.setdefault(spreadsheet_id, {})[sheet_title] = values
        if notes:
            self.notes.setdefault(spreadsheet_id, {})[sheet_title] = list(notes)
        self.anchors.setdefault(spreadsheet_id, {})[sheet_title] = anchor
        self.last_sync_at[spreadsheet_id] = datetime.utcnow()
        return {
            "updated_cells": sum(len(r) for r in values),
            "sheet": sheet_title,
            "notes_written": len(notes or []),
            "anchor": anchor,
        }

    async def fetch_preview(
        self,
        spreadsheet_id: str,
        *,
        max_rows: int = 200,
        max_cols: int = 40,
    ) -> dict[str, Any]:
        sheets = self.spreadsheets.get(spreadsheet_id, {})
        notes_by_sheet = self.notes.get(spreadsheet_id, {})
        worksheets: list[dict[str, Any]] = []
        for idx, (title, values) in enumerate(sheets.items()):
            sheet_notes = {
                (n["row"], n["col"]): str(n["note"])
                for n in notes_by_sheet.get(title, [])
            }
            rows = []
            for r, row in enumerate(values[:max_rows]):
                cells = []
                for c, cell in enumerate(row[:max_cols]):
                    out: dict[str, Any] = {"v": cell}
                    note = sheet_notes.get((r, c))
                    if note:
                        out["note"] = note
                    cells.append(out)
                rows.append(cells)
            worksheets.append(
                {
                    "sheet_id": idx,
                    "title": title,
                    "row_count": len(values),
                    "col_count": max((len(r) for r in values), default=0),
                    "rows": rows,
                }
            )
        return {
            "spreadsheet_id": spreadsheet_id,
            "title": spreadsheet_id,
            "worksheets": worksheets,
        }

    async def write_cells(
        self,
        spreadsheet_id: str,
        sheet_title: str,
        cells: list[dict[str, Any]],
    ) -> dict[str, Any]:
        grid = self.spreadsheets.setdefault(spreadsheet_id, {}).setdefault(
            sheet_title, []
        )
        notes_written = 0
        for cell in cells:
            r, c = int(cell["row"]), int(cell["col"])
            while len(grid) <= r:
                grid.append([])
            while len(grid[r]) <= c:
                grid[r].append("")
            grid[r][c] = cell.get("value", "")
            if cell.get("note"):
                self.notes.setdefault(spreadsheet_id, {}).setdefault(
                    sheet_title, []
                ).append({"row": r, "col": c, "note": str(cell["note"])})
                notes_written += 1
        self.last_sync_at[spreadsheet_id] = datetime.utcnow()
        return {
            "updated_cells": len(cells),
            "sheet": sheet_title,
            "notes_written": notes_written,
        }


class GoogleApiClient:
    """Real client. Two construction paths:

    * **Service account**: ``service_account_json`` (raw JSON string). Admin's
      tenant-level fallback path — same credentials act for any user.
    * **OAuth user token**: ``access_token`` (a Google access token from
      the per-teacher OAuth flow). Acts as that specific teacher; access
      to a spreadsheet is whatever the teacher's own Google account has.

    If both are passed, the OAuth token wins. Falls back to ``InMemory``
    when neither produces a working credentials object — that signals
    "Google Sheets не подключён" to the caller via ``_impl is None``.
    """

    def __init__(
        self,
        service_account_json: str | None = None,
        access_token: str | None = None,
    ):
        self._impl = None
        # OAuth path: lightest — single token, no JSON parse.
        if access_token:
            try:  # pragma: no cover - integration only
                from google.oauth2.credentials import Credentials  # type: ignore
                from googleapiclient.discovery import build  # type: ignore

                creds = Credentials(token=access_token)
                self._impl = build(
                    "sheets", "v4", credentials=creds, cache_discovery=False
                )
            except Exception:
                self._impl = None
        # SA path (fallback or admin's tenant config).
        if self._impl is None and service_account_json:
            try:  # pragma: no cover - integration only
                import json

                from google.oauth2 import service_account  # type: ignore
                from googleapiclient.discovery import build  # type: ignore

                info = json.loads(service_account_json)
                creds = service_account.Credentials.from_service_account_info(
                    info, scopes=["https://www.googleapis.com/auth/spreadsheets"]
                )
                self._impl = build("sheets", "v4", credentials=creds, cache_discovery=False)
            except Exception:
                self._impl = None
        if self._impl is None:
            self._fallback = InMemoryGoogleSheetsClient()
        else:
            self._fallback = None

    async def batch_update(
        self,
        spreadsheet_id: str,
        sheet_title: str,
        values: list[list[Any]],
        notes: list[dict[str, Any]] | None = None,
        anchor: str = "A1",
    ) -> dict[str, Any]:
        if self._fallback is not None:
            return await self._fallback.batch_update(
                spreadsheet_id, sheet_title, values, notes=notes, anchor=anchor
            )
        # pragma: no cover - integration path
        body = {
            "valueInputOption": "RAW",
            "data": [{"range": f"{sheet_title}!{anchor}", "values": values}],
        }
        resp = (
            self._impl.spreadsheets()
            .values()
            .batchUpdate(spreadsheetId=spreadsheet_id, body=body)
            .execute()
        )
        if notes:
            try:
                resp["notes_written"] = self._write_notes(
                    spreadsheet_id, sheet_title, notes
                )
            except Exception:
                resp["notes_written"] = 0
        return resp

    def _write_notes(  # pragma: no cover - integration path
        self,
        spreadsheet_id: str,
        sheet_title: str,
        notes: list[dict[str, Any]],
    ) -> int:
        """Resolve the sheet id, then write each note via ``updateCells``."""
        meta = (
            self._impl.spreadsheets()
            .get(spreadsheetId=spreadsheet_id, fields="sheets.properties")
            .execute()
        )
        sheet_id = None
        for sh in meta.get("sheets", []):
            props = sh.get("properties", {})
            if props.get("title") == sheet_title:
                sheet_id = props.get("sheetId")
                break
        if sheet_id is None:
            return 0
        requests = [
            {
                "updateCells": {
                    "range": {
                        "sheetId": sheet_id,
                        "startRowIndex": n["row"],
                        "endRowIndex": n["row"] + 1,
                        "startColumnIndex": n["col"],
                        "endColumnIndex": n["col"] + 1,
                    },
                    "rows": [{"values": [{"note": str(n["note"])}]}],
                    "fields": "note",
                }
            }
            for n in notes
        ]
        self._impl.spreadsheets().batchUpdate(
            spreadsheetId=spreadsheet_id, body={"requests": requests}
        ).execute()
        return len(requests)

    async def fetch_preview(
        self,
        spreadsheet_id: str,
        *,
        max_rows: int = 200,
        max_cols: int = 40,
    ) -> dict[str, Any]:
        if self._fallback is not None:
            return await self._fallback.fetch_preview(
                spreadsheet_id, max_rows=max_rows, max_cols=max_cols
            )
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            None, self._fetch_preview_sync, spreadsheet_id, max_rows, max_cols
        )

    def _fetch_preview_sync(  # pragma: no cover - integration path
        self, spreadsheet_id: str, max_rows: int, max_cols: int
    ) -> dict[str, Any]:
        meta = (
            self._impl.spreadsheets()
            .get(spreadsheetId=spreadsheet_id, includeGridData=True)
            .execute()
        )
        return _parse_preview(meta, max_rows=max_rows, max_cols=max_cols)

    async def write_cells(
        self,
        spreadsheet_id: str,
        sheet_title: str,
        cells: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Write scattered single cells (no contiguous-block overwrite),
        so grades slot into the teacher's existing roster without
        clobbering neighbouring columns/rows. Notes ride along."""
        if self._fallback is not None:
            return await self._fallback.write_cells(
                spreadsheet_id, sheet_title, cells
            )
        # pragma: no cover - integration path
        data = [
            {
                "range": f"{sheet_title}!{a1_of(int(c['row']), int(c['col']))}",
                "values": [[c.get("value", "")]],
            }
            for c in cells
        ]
        resp = (
            self._impl.spreadsheets()
            .values()
            .batchUpdate(
                spreadsheetId=spreadsheet_id,
                body={"valueInputOption": "RAW", "data": data},
            )
            .execute()
        )
        notes = [
            {"row": int(c["row"]), "col": int(c["col"]), "note": c["note"]}
            for c in cells
            if c.get("note")
        ]
        if notes:
            try:
                resp["notes_written"] = self._write_notes(
                    spreadsheet_id, sheet_title, notes
                )
            except Exception:  # noqa: BLE001
                resp["notes_written"] = 0
        return resp


def _parse_preview(  # pragma: no cover - exercised via real client
    meta: dict[str, Any], *, max_rows: int, max_cols: int
) -> dict[str, Any]:
    """Map the Google Sheets API response into the compact UI shape:
    ``{ spreadsheet_id, title, worksheets: [{ sheet_id, title, row_count,
    col_count, rows: [[{v, note?}, …], …] }] }``."""
    worksheets: list[dict[str, Any]] = []
    for sh in meta.get("sheets", []):
        props = sh.get("properties", {})
        grid = props.get("gridProperties", {})
        rows: list[list[dict[str, Any]]] = []
        data_blocks = sh.get("data") or []
        if data_blocks:
            row_data = data_blocks[0].get("rowData") or []
            for row in row_data[:max_rows]:
                cells_in: list[dict[str, Any]] = row.get("values") or []
                cells_out: list[dict[str, Any]] = []
                for cell in cells_in[:max_cols]:
                    effective = cell.get("effectiveValue") or {}
                    if "stringValue" in effective:
                        v: Any = effective["stringValue"]
                    elif "numberValue" in effective:
                        v = effective["numberValue"]
                    elif "boolValue" in effective:
                        v = effective["boolValue"]
                    elif "formulaValue" in effective:
                        v = effective["formulaValue"]
                    else:
                        v = cell.get("formattedValue") or ""
                    note = cell.get("note")
                    out: dict[str, Any] = {"v": v}
                    if note:
                        out["note"] = note
                    cells_out.append(out)
                rows.append(cells_out)
        worksheets.append(
            {
                "sheet_id": props.get("sheetId"),
                "title": props.get("title"),
                "row_count": grid.get("rowCount", 0),
                "col_count": grid.get("columnCount", 0),
                "rows": rows,
            }
        )
    return {
        "spreadsheet_id": meta.get("spreadsheetId"),
        "title": (meta.get("properties") or {}).get("title", ""),
        "worksheets": worksheets,
    }


# ---------------------------------------------------------------------------
# Write path
# ---------------------------------------------------------------------------


async def sync_to_sheet(
    client: GoogleSheetsClient,
    spreadsheet_id: str,
    sheet_title: str,
    result: BuilderResult,
    anchor: str = "A1",
) -> dict[str, Any]:
    """Push ``result`` into ``sheet_title`` starting at ``anchor`` (A1
    notation). Cell notes ride along to native Google Sheets notes."""
    values: list[list[Any]] = [list(result.columns)]
    for row in result.rows:
        values.append([row.get(c, "") for c in result.columns])

    # Translate ``cell_notes`` (row index into ``result.rows`` + column
    # *name*) into absolute sheet positions: column → header index, row →
    # +1 for the header. With a non-A1 anchor, shift by (anchor_row,
    # anchor_col).
    try:
        anchor_row, anchor_col = parse_a1(anchor)
    except ValueError:
        anchor_row, anchor_col = 0, 0
        anchor = "A1"
    col_index = {c: i for i, c in enumerate(result.columns)}
    notes: list[dict[str, Any]] = []
    for n in result.cell_notes:
        ci = col_index.get(n.get("column"))
        ri = n.get("row")
        text = n.get("note")
        if ci is None or not isinstance(ri, int) or not text:
            continue
        notes.append(
            {
                "row": anchor_row + 1 + ri,
                "col": anchor_col + ci,
                "note": str(text),
            }
        )

    return await client.batch_update(
        spreadsheet_id, sheet_title, values, notes=notes or None, anchor=anchor
    )
