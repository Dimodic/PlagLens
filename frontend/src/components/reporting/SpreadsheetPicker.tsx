/**
 * SpreadsheetPicker — interactive Google Sheets viewer + cell-range picker.
 *
 * The teacher pastes a spreadsheet id; the backend (`GET /api/v1/sheets/
 * {id}/preview`) fetches its contents and feeds them in here. We render
 * every worksheet as a tab strip, the active tab as a real grid with
 * Excel-style A/B/C column letters and 1/2/3 row numbers, and let the
 * teacher *drag a rectangle* of cells — that selection becomes the
 * "куда писать оценки" anchor for the export.
 *
 * Selection model
 *   - One rectangle at a time, anchored to a specific tab.
 *   - Mouse-down on a cell starts the rectangle; drag expands it; mouse-up
 *     anywhere commits it. (Document-level mouse-up listener — without
 *     it letting go off the grid would strand the drag.)
 *   - Switching tabs hides the previous selection visually (it stays in
 *     state); dragging on a new tab overwrites it.
 *
 * Performance
 *   - Backend already caps cells at ``max_rows × max_cols``. We add a
 *     small ``maxVisibleRows / maxVisibleCols`` UI cap as a second
 *     guard — bigger sheets would need real virtualisation, out of
 *     scope here.
 *
 * Note indicators
 *   - A small amber triangle in the top-right corner of a cell signals
 *     a Google Sheets cell note. Hovering shows the note text.
 */
import { useEffect, useState } from 'react';
import { cn } from '@/components/ui/utils';
import type {
  PreviewSpreadsheet,
  PreviewWorksheet,
} from '@/api/endpoints/reporting';

export interface SheetSelection {
  /** Worksheet title — selection is anchored to a specific tab. */
  sheet_title: string;
  /** 0-indexed inclusive coordinates of the selection rectangle. */
  start_row: number;
  start_col: number;
  end_row: number;
  end_col: number;
}

interface SpreadsheetPickerProps {
  preview: PreviewSpreadsheet;
  selection: SheetSelection | null;
  onSelectionChange: (s: SheetSelection | null) => void;
  /** Hard cap on cells drawn — cosmetic, backend already truncates. */
  maxVisibleRows?: number;
  maxVisibleCols?: number;
}

// ---------------------------------------------------------------------------
// A1 helpers
// ---------------------------------------------------------------------------

export function colLabel(idx: number): string {
  let s = '';
  let n = idx + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function selectionToA1(s: SheetSelection): string {
  const a = `${colLabel(s.start_col)}${s.start_row + 1}`;
  const b = `${colLabel(s.end_col)}${s.end_row + 1}`;
  return a === b ? a : `${a}:${b}`;
}

/** Top-left cell of a selection in A1 (e.g. "B5"). What the backend
 *  ``anchor_cell`` scope param expects. */
export function selectionAnchor(s: SheetSelection): string {
  return `${colLabel(s.start_col)}${s.start_row + 1}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SpreadsheetPicker({
  preview,
  selection,
  onSelectionChange,
  maxVisibleRows = 200,
  maxVisibleCols = 40,
}: SpreadsheetPickerProps) {
  const [activeTabIdx, setActiveTabIdx] = useState(0);
  useEffect(() => {
    // Defensive — preview swap could leave us pointing past the end.
    if (activeTabIdx >= preview.worksheets.length) setActiveTabIdx(0);
  }, [preview, activeTabIdx]);
  const active: PreviewWorksheet | undefined = preview.worksheets[activeTabIdx];

  // Active drag rectangle (null when nothing being dragged).
  const [drag, setDrag] = useState<{
    start: { row: number; col: number };
    end: { row: number; col: number };
  } | null>(null);

  // Mouse-up *anywhere* commits the drag — without a doc-level listener,
  // letting go off the grid leaves the drag in a half-baked state.
  useEffect(() => {
    if (!drag || !active) return;
    const onUp = () => {
      onSelectionChange({
        sheet_title: active.title,
        start_row: Math.min(drag.start.row, drag.end.row),
        start_col: Math.min(drag.start.col, drag.end.col),
        end_row: Math.max(drag.start.row, drag.end.row),
        end_col: Math.max(drag.start.col, drag.end.col),
      });
      setDrag(null);
    };
    document.addEventListener('mouseup', onUp);
    return () => document.removeEventListener('mouseup', onUp);
  }, [drag, active, onSelectionChange]);

  if (!active) {
    return (
      <div className="rounded-md border border-border/60 p-8 text-center text-sm text-muted-foreground">
        В таблице нет листов.
      </div>
    );
  }

  // Effective rectangle to highlight on the current tab: live drag wins,
  // else the committed selection if it's anchored here.
  let highlight: { sRow: number; sCol: number; eRow: number; eCol: number } | null =
    null;
  if (drag) {
    highlight = {
      sRow: Math.min(drag.start.row, drag.end.row),
      sCol: Math.min(drag.start.col, drag.end.col),
      eRow: Math.max(drag.start.row, drag.end.row),
      eCol: Math.max(drag.start.col, drag.end.col),
    };
  } else if (selection && selection.sheet_title === active.title) {
    highlight = {
      sRow: selection.start_row,
      sCol: selection.start_col,
      eRow: selection.end_row,
      eCol: selection.end_col,
    };
  }

  const rows = active.rows.slice(0, maxVisibleRows);
  const widestRow = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const visibleCols = Math.max(
    1,
    Math.min(maxVisibleCols, Math.max(active.col_count, widestRow, 8)),
  );

  const isSel = (r: number, c: number): boolean =>
    highlight !== null &&
    r >= highlight.sRow &&
    r <= highlight.eRow &&
    c >= highlight.sCol &&
    c <= highlight.eCol;

  const onCellMouseDown =
    (r: number, c: number) => (e: React.MouseEvent) => {
      e.preventDefault();
      setDrag({ start: { row: r, col: c }, end: { row: r, col: c } });
    };
  const onCellMouseEnter = (r: number, c: number) => () => {
    if (drag) setDrag({ start: drag.start, end: { row: r, col: c } });
  };

  return (
    <div className="space-y-2" data-testid="spreadsheet-picker">
      {/* Worksheet tabs */}
      <div
        className="flex flex-wrap gap-1 border-b border-border/60"
        role="tablist"
      >
        {preview.worksheets.map((w, i) => (
          <button
            key={`${w.sheet_id}-${w.title}`}
            type="button"
            role="tab"
            aria-selected={i === activeTabIdx}
            onClick={() => setActiveTabIdx(i)}
            data-testid={`sheet-tab-${i}`}
            className={cn(
              'rounded-t-md px-3 py-1.5 text-sm transition-colors',
              i === activeTabIdx
                ? '-mb-px border-b-2 border-foreground font-medium text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {w.title}
          </button>
        ))}
      </div>

      {/* Grid — scrolls inside its own container so the page doesn't
          balloon. Sticky headers keep A/B/C and 1/2/3 in view while
          scrolling a large sheet. */}
      <div
        className="overflow-auto rounded-md border border-border/60 bg-background select-none"
        style={{ maxHeight: '60vh' }}
      >
        <table className="border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <tr>
              <th className="sticky left-0 z-20 w-10 border-b border-r border-border/60 bg-muted/80" />
              {Array.from({ length: visibleCols }, (_, c) => (
                <th
                  key={c}
                  className={cn(
                    'min-w-[100px] border-b border-r border-border/60 px-2 py-1 text-center font-medium text-muted-foreground',
                    highlight && c >= highlight.sCol && c <= highlight.eCol
                      ? 'bg-primary/20 text-foreground'
                      : '',
                  )}
                >
                  {colLabel(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                <th
                  className={cn(
                    'sticky left-0 z-[1] w-10 border-b border-r border-border/60 bg-muted/80 px-2 py-1 text-center font-normal text-muted-foreground',
                    highlight && r >= highlight.sRow && r <= highlight.eRow
                      ? 'bg-primary/20 text-foreground'
                      : '',
                  )}
                >
                  {r + 1}
                </th>
                {Array.from({ length: visibleCols }, (_, c) => {
                  const cell = row[c];
                  const sel = isSel(r, c);
                  const display =
                    cell == null || cell.v == null
                      ? ''
                      : typeof cell.v === 'boolean'
                        ? cell.v
                          ? 'TRUE'
                          : 'FALSE'
                        : String(cell.v);
                  return (
                    <td
                      key={c}
                      title={
                        cell?.note ? `${display}\n— ${cell.note}` : display
                      }
                      onMouseDown={onCellMouseDown(r, c)}
                      onMouseEnter={onCellMouseEnter(r, c)}
                      data-testid={`cell-${r}-${c}`}
                      className={cn(
                        'relative max-w-[200px] overflow-hidden text-ellipsis whitespace-nowrap border-b border-r border-border/40 px-2 py-1',
                        'cursor-cell',
                        sel
                          ? 'bg-primary/15 outline outline-1 -outline-offset-1 outline-primary'
                          : 'hover:bg-muted/40',
                      )}
                    >
                      {display}
                      {cell?.note && (
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute right-0 top-0 h-2 w-2 bg-amber-500"
                          style={{
                            clipPath: 'polygon(100% 0, 100% 100%, 0 0)',
                          }}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Selection readout */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div data-testid="spreadsheet-picker-selection">
          {selection && selection.sheet_title === active.title ? (
            <span>
              Выбрано:{' '}
              <span className="font-mono text-foreground">
                {active.title}!{selectionToA1(selection)}
              </span>{' '}
              · левый-верхний угол =
              <span className="ml-1 font-mono text-foreground">
                {selectionAnchor(selection)}
              </span>
            </span>
          ) : selection ? (
            <span>
              Выделение на вкладке{' '}
              <span className="font-mono text-foreground">
                {selection.sheet_title}
              </span>{' '}
              · переключите вкладку, чтобы увидеть
            </span>
          ) : (
            <span>
              Кликните или выделите прямоугольник — куда положить оценки
            </span>
          )}
        </div>
        {selection && (
          <button
            type="button"
            onClick={() => onSelectionChange(null)}
            className="hover:text-foreground"
            data-testid="spreadsheet-picker-reset"
          >
            Сбросить
          </button>
        )}
      </div>
    </div>
  );
}

export default SpreadsheetPicker;
