/**
 * UniverSpreadsheetPicker — Google-Sheets-style preview that lets the
 * teacher pick the anchor cell for the grade export.
 *
 * Drop-in replacement for the original hand-rolled SpreadsheetPicker:
 * same `preview` / `selection` / `onSelectionChange` contract, same
 * exported helpers (`colLabel`, `selectionAnchor`, `selectionToA1`).
 *
 * Under the hood it boots a Univer (@univerjs/presets + sheets-core)
 * spreadsheet inside a single ref'd container, converts our compact
 * backend `PreviewSpreadsheet` into Univer's `IWorkbookData`, and
 * subscribes to the `SelectionChanged` event so the parent gets the
 * picked range back in `SheetSelection` shape.
 *
 * Notes
 *   • Univer ships its own CSS theme and a sizeable runtime; the
 *     module is imported lazily here so it doesn't bloat the rest of
 *     the bundle.
 *   • The grid stays editable (Univer doesn't expose a clean
 *     read-only switch via the public API), but the teacher's workflow
 *     here is to click-pick a cell range and exit — any accidental
 *     edits in the preview don't affect the real Google sheet.
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type {
  PreviewSpreadsheet,
  PreviewWorksheet,
} from '@/api/endpoints/reporting';

// ---------------------------------------------------------------------------
// Public types — kept identical to the legacy SpreadsheetPicker so
// upstream callers / tests don't have to change.
// ---------------------------------------------------------------------------

export interface SheetSelection {
  /** Worksheet title — selection is anchored to a specific tab. */
  sheet_title: string;
  /** 0-indexed inclusive coordinates of the selection rectangle. */
  start_row: number;
  start_col: number;
  end_row: number;
  end_col: number;
}

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

export function selectionAnchor(s: SheetSelection): string {
  return `${colLabel(s.start_col)}${s.start_row + 1}`;
}

/** A "paint" request asks the picker to write a backend grade matrix
 *  into the named sheet, **matching by student name** against an
 *  existing names column (default A). For every matrix row the
 *  picker looks up the row in the sheet whose names-column value
 *  equals `row[0]` (the student name from the matrix) and writes the
 *  grade columns (`row[1..]`) starting at `anchorCol` on that row.
 *  Rows without a match are reported back via `onApplied` so the
 *  parent can surface a "matched N of M" toast.
 *
 *  Pass a new object (different reference) every time you want a
 *  re-paint; the picker ignores prop updates whose reference is
 *  unchanged. */
export interface PaintRequest {
  sheet: string;
  /** Column index where grade values should land (0-based). For
   *  multi-ДЗ matrices the picker writes successive grade columns to
   *  `anchorCol`, `anchorCol + 1`, … */
  anchorCol: number;
  /** 2D matrix produced by the backend grade builder.
   *  `matrix[0]` = header row (`[студентCol, ...gradeCols]`).
   *  `matrix[1..]` = one row per student. */
  matrix: (string | number | null)[][];
  /** Column to look up student names in (default 0 = column A). */
  namesCol?: number;
  /** How many rows to scan for names (default 500). Cheap upper bound
   *  on real-world class sizes. */
  scanRows?: number;
  /** Fires after the paint with the matching outcome. */
  onApplied?: (result: { matched: number; skipped: number }) => void;
}

interface UniverSpreadsheetPickerProps {
  preview: PreviewSpreadsheet;
  selection: SheetSelection | null;
  onSelectionChange: (s: SheetSelection | null) => void;
  /** Optional preview-paint instruction (see {@link PaintRequest}). */
  paint?: PaintRequest | null;
  /** CSS height for the embedded grid; defaults to ``420px``. */
  height?: number | string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function UniverSpreadsheetPicker({
  preview,
  selection,
  onSelectionChange,
  paint,
  height = 420,
}: UniverSpreadsheetPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // The instance state holds the Univer disposable + the active API
  // handle so we can re-render the workbook when `preview` changes
  // without tearing down + recreating Univer (expensive bootstrap).
  const instanceRef = useRef<{
    dispose: () => void;
    loadPreview: (p: PreviewSpreadsheet) => void;
    applyPaint: (req: PaintRequest) => void;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mount Univer once. The lazy `import()` keeps the runtime out of
  // the main JS chunk — it only ships when a teacher actually opens
  // the Sheets export form.
  useEffect(() => {
    let cancelled = false;
    if (!containerRef.current) return;
    const container = containerRef.current;

    (async () => {
      try {
        const [presets, sheetsCore, localeRu] = await Promise.all([
          import('@univerjs/presets'),
          import('@univerjs/preset-sheets-core'),
          import('@univerjs/preset-sheets-core/locales/ru-RU').catch(
            () => null,
          ),
        ]);
        // Univer ships its own CSS — must be loaded for the grid to
        // render correctly. Side-effect import.
        await import('@univerjs/preset-sheets-core/lib/index.css');

        if (cancelled) return;

        const {
          createUniver,
          defaultTheme,
          LocaleType,
          merge,
        } = presets;
        const { UniverSheetsCorePreset } = sheetsCore;
        // The ru-RU locale file may be missing in older Univer
        // versions; fall back to bundled en-US so the grid still
        // works.  Using `LocaleType.RU_RU` if available, otherwise
        // `EN_US`.
        const localeKey = localeRu?.default
          ? LocaleType.RU_RU
          : LocaleType.EN_US;
        const localeData = localeRu?.default ?? {};

        const { univer, univerAPI } = createUniver({
          locale: localeKey,
          locales: { [localeKey]: merge({}, localeData) },
          theme: defaultTheme,
          presets: [
            // We just need a *picker*, not a full editor. Strip the
            // toolbar / formula bar / context menu — those are the
            // chrome that lit up the whole screen white in the
            // previous build and serve no purpose here (the teacher
            // selects a range and exits). The sheet-tabs footer stays
            // on so multi-sheet docs can be navigated.
            UniverSheetsCorePreset({
              container,
              header: false,
              formulaBar: false,
              toolbar: false,
            }),
          ],
        });

        // Forward selection events to the parent. We access the
        // event identifier and the `addEvent` signature loosely
        // because TS's union of event names is conditionally typed
        // on which UI plugins are loaded — Univer narrows it via
        // augmentation, but sheets-ui's event isn't in the bundled
        // `IEventParamConfig` keys for our installed version.
        const api = univerAPI as unknown as {
          addEvent: (name: string, cb: (p: unknown) => void) => {
            dispose: () => void;
          };
          Event: Record<string, string>;
        };
        const eventName =
          api.Event?.SelectionChanged ?? 'SelectionChanged';
        const selDisposable = api.addEvent(
          eventName,
          (params: unknown) => {
            const p = params as {
              worksheet?: { getName?: () => string };
              selections?: Array<{
                startRow: number;
                endRow: number;
                startColumn: number;
                endColumn: number;
              }>;
            };
            const sheet = p?.worksheet;
            const range = p?.selections?.[0];
            if (!sheet || !range) return;
            const name = sheet.getName?.() ?? '';
            onSelectionChange({
              sheet_title: name,
              start_row: range.startRow,
              start_col: range.startColumn,
              end_row: range.endRow,
              end_col: range.endColumn,
            });
          },
        );

        const loadPreview = (p: PreviewSpreadsheet) => {
          // Read live theme colours every time we (re)load a preview
          // so the embed adapts after a theme toggle without needing
          // a full Univer remount.
          const palette = readPalette();
          // Dispose the previous workbook (if any) before adding a
          // new one — Univer doesn't auto-swap.
          const existing = univerAPI.getActiveWorkbook?.();
          if (existing && (existing as { dispose?: () => void }).dispose) {
            try {
              (existing as { dispose: () => void }).dispose();
            } catch {
              // Best-effort: ignore disposal failures.
            }
          }
          const workbook = univerAPI.createWorkbook(
            previewToWorkbook(p, palette),
          );
          // Dark-theme the canvas-rendered row/column header gutters.
          // These live outside `IWorkbookData` — sheets-ui paints them
          // with its own white-on-black defaults. The FWorkbook facade
          // exposes `customizeRow/ColumnHeader` that propagates the
          // style into the canvas renderer.
          //
          // Timing: calling them synchronously right after createWorkbook
          // is a no-op — the render component for the unit hasn't been
          // attached yet, so `setCustomHeader` resolves against a null
          // renderer and silently drops on the floor. We defer through
          // `requestAnimationFrame` (one frame is enough in practice)
          // so the render manager has had a tick to register the unit.
          const styleHeaders = () => {
            const wb = workbook as unknown as {
              customizeColumnHeader?: (cfg: {
                headerStyle: {
                  fontColor?: string;
                  backgroundColor?: string;
                };
              }) => void;
              customizeRowHeader?: (cfg: {
                headerStyle: {
                  fontColor?: string;
                  backgroundColor?: string;
                };
              }) => void;
            };
            const headerStyle = {
              fontColor: palette.headerFg,
              backgroundColor: palette.headerBg,
            };
            try {
              wb.customizeColumnHeader?.({ headerStyle });
              wb.customizeRowHeader?.({ headerStyle });
            } catch {
              /* best-effort */
            }
          };
          requestAnimationFrame(() => {
            // One frame is usually enough, but on slower hosts the
            // render manager can still be mid-mount. Run again on the
            // next tick as a cheap retry — both calls are idempotent.
            styleHeaders();
            setTimeout(styleHeaders, 200);
          });
        };
        loadPreview(preview);

        /** Name-match an incoming grade matrix against the existing
         *  names column of `req.sheet` and write each row's grade
         *  values into the matched row, starting at `req.anchorCol`.
         *
         *  Why name-matching: the user's sheet already has students in
         *  whatever order they chose (alphabetical, group, custom).
         *  Dumping the backend matrix top-down from an arbitrary
         *  anchor would mis-align all grades. Looking up by name puts
         *  each grade next to the student it belongs to, regardless
         *  of where in the sheet that student lives.
         *
         *  Matching is case-insensitive on the trimmed string. Names
         *  the backend has that don't exist in the sheet are skipped
         *  silently and reported through `onApplied({matched, skipped})`
         *  so the parent can surface a "matched N of M" toast. */
        const applyPaint = (req: PaintRequest) => {
          if (req.matrix.length < 2) {
            req.onApplied?.({ matched: 0, skipped: 0 });
            return;
          }
          try {
            const wb = univerAPI.getActiveWorkbook() as unknown as {
              getSheetByName?: (n: string) =>
                | {
                    getRange: (
                      r: number,
                      c: number,
                      nr: number,
                      nc: number,
                    ) => {
                      setValues: (m: unknown) => void;
                      getValues: () => Array<Array<unknown>>;
                    };
                    setActiveRange?: (range: unknown) => unknown;
                  }
                | null;
              setActiveSheet?: (s: unknown) => void;
            } | null;
            if (!wb || !wb.getSheetByName) return;
            const sheet = wb.getSheetByName(req.sheet);
            if (!sheet) return;
            if (wb.setActiveSheet) {
              try {
                wb.setActiveSheet(sheet);
              } catch {
                /* best-effort */
              }
            }
            const namesCol = req.namesCol ?? 0;
            const scanRows = req.scanRows ?? 500;
            // Read the existing names column once and build a
            // lower-cased → row-index map.
            const existingNames = sheet
              .getRange(0, namesCol, scanRows, 1)
              .getValues();
            const rowByName = new Map<string, number>();
            existingNames.forEach((cells, rowIdx) => {
              const raw = cells[0];
              if (raw == null) return;
              const key = String(raw).trim().toLowerCase();
              if (key) rowByName.set(key, rowIdx);
            });
            // First row of the matrix is the header (column titles);
            // the remaining rows are student data. We skip the
            // student-name column itself when writing — the sheet
            // already has its own.
            const dataRows = req.matrix.slice(1);
            let matched = 0;
            let skipped = 0;
            let firstMatchedRow: number | null = null;
            for (const row of dataRows) {
              const key = String(row[0] ?? '')
                .trim()
                .toLowerCase();
              if (!key) {
                skipped += 1;
                continue;
              }
              const target = rowByName.get(key);
              if (target === undefined) {
                skipped += 1;
                continue;
              }
              const grades = row.slice(1);
              if (grades.length === 0) continue;
              sheet
                .getRange(target, req.anchorCol, 1, grades.length)
                .setValues([grades] as unknown as Array<Array<unknown>>);
              matched += 1;
              if (firstMatchedRow === null) firstMatchedRow = target;
            }
            // Scroll to the first matched row + anchor column so the
            // teacher SEES the freshly placed grades.
            if (firstMatchedRow !== null) {
              try {
                const previewCols = Math.max(
                  1,
                  (req.matrix[0]?.length ?? 1) - 1,
                );
                sheet.setActiveRange?.(
                  sheet.getRange(
                    firstMatchedRow,
                    req.anchorCol,
                    1,
                    previewCols,
                  ),
                );
              } catch {
                /* best-effort */
              }
            }
            req.onApplied?.({ matched, skipped });
          } catch {
            req.onApplied?.({ matched: 0, skipped: 0 });
          }
        };

        instanceRef.current = {
          applyPaint,
          dispose: () => {
            try {
              selDisposable?.dispose?.();
            } catch {
              /* ignore */
            }
            try {
              univer.dispose();
            } catch {
              /* ignore */
            }
          },
          loadPreview,
        };
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(
          e instanceof Error
            ? e.message
            : 'Не удалось загрузить Univer',
        );
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      instanceRef.current?.dispose();
      instanceRef.current = null;
    };
    // We only want to mount Univer once. Subsequent `preview` changes
    // are handled by the separate effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-feed the workbook when the preview prop changes.
  useEffect(() => {
    if (instanceRef.current && preview) {
      instanceRef.current.loadPreview(preview);
    }
  }, [preview]);

  // Apply a paint request when the parent hands us a new one.  Each
  // distinct `paint` object reference fires once; identity-stable
  // updates (e.g. memoised inputs) won't repaint.
  useEffect(() => {
    if (instanceRef.current && paint) {
      instanceRef.current.applyPaint(paint);
    }
  }, [paint]);

  // Acknowledge external `selection` resets so the linter is happy —
  // Univer drives its own selection state, we just listen.
  useEffect(() => {
    // no-op: external selection is mirrored from this component into
    // the parent.
    void selection;
  }, [selection]);

  return (
    <div className="relative w-full overflow-hidden rounded-md border border-border bg-card univer-dark-scope">
      {/* Univer ships its design system tuned for a light page; this
          scoped style flips the chrome that ISN'T rendered to canvas
          (sheet tabs, scrollbars, popovers) to a dark palette so the
          embed doesn't burn out the surrounding dialog. */}
      <style>{UNIVER_DARK_CSS}</style>
      <div
        ref={containerRef}
        data-testid="univer-spreadsheet"
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
        className="w-full"
      />
      {/* Mask for the top-left corner cell. It's `SHEET_VIEW_KEY.
          LEFT_TOP` — a separate canvas component that
          customizeRow/ColumnHeader can't touch and that ships white
          in dark mode. Default header sizes are ~46×20 px; we cover
          a slightly larger area to swallow the 1-px gridline that
          sheets-ui draws under the corner. `z-10` keeps the mask
          above the canvas; `pointer-events-none` lets cell clicks
          fall through to Univer (they start past this area anyway).
          Inline `var(--muted)` so theme switches are picked up
          without remount. */}
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-10"
        style={{
          width: 48,
          height: 22,
          background: 'var(--muted)',
        }}
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Загружаем таблицу…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-sm text-destructive">
          {error}
        </div>
      )}
    </div>
  );
}

// Theme overrides for Univer's DOM chrome (sheet tabs, popovers,
// scrollbars). Scoped under `.dark .univer-dark-scope` so light mode
// keeps Univer's stock palette and dark mode pulls our token values
// — no hard-coded hex, the same CSS variables drive the rest of the
// app. Light mode = Univer's defaults are already fine.
const UNIVER_DARK_CSS = `
.dark .univer-dark-scope {
  color-scheme: dark;
}
.dark .univer-dark-scope .univer-bg-white,
.dark .univer-dark-scope .univer-bg-gray-50,
.dark .univer-dark-scope .univer-bg-gray-100 {
  background-color: var(--background) !important;
}
.dark .univer-dark-scope .univer-text-gray-900,
.dark .univer-dark-scope .univer-text-gray-800,
.dark .univer-dark-scope .univer-text-gray-700 {
  color: var(--muted-foreground) !important;
}
.dark .univer-dark-scope .univer-border-gray-200,
.dark .univer-dark-scope .univer-border-gray-300 {
  border-color: var(--border) !important;
}
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Dark-mode palette baked into the workbook snapshot. Univer's canvas
// is rendered programmatically (no DOM CSS reaches the cells), so we
// drive its appearance through a per-cell style id + `gridlinesColor`
// + `customizeRow/ColumnHeader`. Values approximate the app's actual
// dark theme tokens (`oklch(0.145 …)` for background etc.) so the
// embedded grid sits on the same neutral scale as the surrounding
// dialog instead of looking like black-on-white.
// Univer's canvas paints colours from hex/rgb literals — it doesn't
// resolve CSS variables. The app meanwhile keeps its palette in oklch
// CSS tokens (`--background`, `--muted`, …) that flip with the
// `next-themes` `class="dark"|"light"` switch. We bridge the two by
// reading the *computed* value of each var from a hidden probe at
// mount time: the browser hands back the resolved sRGB triplet, we
// translate that to hex, and feed Univer. Result: the embedded grid
// automatically matches whichever theme is active.
//
// (The probe approach also sidesteps building our own oklch→sRGB
// converter — the browser's CSS engine already has one.)
function readThemeColor(varName: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;visibility:hidden;color:var(${varName})`;
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color;
  document.body.removeChild(probe);
  const m = rgb.match(/rgba?\((\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/);
  if (!m) return fallback;
  const toHex = (n: string) =>
    Math.round(Number(n)).toString(16).padStart(2, '0');
  return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
}

interface DarkPalette {
  cellBg: string;
  cellFg: string;
  gridline: string;
  headerBg: string;
  headerFg: string;
}

/** Linear blend of two hex colours. `t=0` → a, `t=1` → b. Used to
 *  derive a visible-but-quiet gridline from the active fg/bg. */
function lerpHex(a: string, b: string, t: number): string {
  const aP = a.match(/\w\w/g)?.map((h) => parseInt(h, 16)) ?? [0, 0, 0];
  const bP = b.match(/\w\w/g)?.map((h) => parseInt(h, 16)) ?? [0, 0, 0];
  const mix = aP.map((v, i) =>
    Math.round(v * (1 - t) + (bP[i] ?? 0) * t),
  );
  return '#' + mix.map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Read the current theme palette via CSS custom properties — works
 *  for both light and dark since we always pull the *active* values.
 *  The gridline is computed as a blend of foreground over background
 *  so it stays visible without relying on `--border` (which on dark
 *  oklch tokens lands too close to the page bg to read as a line). */
function readPalette(): DarkPalette {
  const cellBg = readThemeColor('--background', '#15171b');
  const cellFg = readThemeColor('--foreground', '#e6e6e8');
  return {
    cellBg,
    cellFg: readThemeColor('--muted-foreground', '#b4b5b8'),
    gridline: lerpHex(cellFg, cellBg, 0.7), // ≈ 30 % fg / 70 % bg
    headerBg: readThemeColor('--muted', '#1d1f24'),
    headerFg: readThemeColor('--muted-foreground', '#9a9b9f'),
  };
}

const DARK_STYLE_ID = 'plaglens-cell';

/** Convert backend's compact `PreviewSpreadsheet` into Univer's
 *  workbook snapshot. Univer indexes cells by `[row][col]` with a
 *  `{ v: <primitive>, s?: <styleId> }` value object; we feed `cell.v`
 *  straight through (the backend's `PreviewCell` uses that key) and
 *  attach a style id pointing at the shared theme cell style so the
 *  text is readable on whichever theme is active. Workbook-level
 *  `defaultStyle` alone isn't reliably applied by sheets-ui's
 *  renderer — explicit per-cell `s` is what actually paints text. */
function previewToWorkbook(
  preview: PreviewSpreadsheet,
  palette: DarkPalette,
): Record<string, unknown> {
  const sheets: Record<string, unknown> = {};
  const sheetOrder: string[] = [];
  preview.worksheets.forEach((ws: PreviewWorksheet, idx: number) => {
    const id = `sheet_${ws.sheet_id ?? idx}`;
    const cellData: Record<number, Record<number, { v: unknown; s: string }>> =
      {};
    const rowCount = Math.max(ws.row_count ?? ws.rows.length, ws.rows.length);
    const colCount = Math.max(
      ws.col_count ?? (ws.rows[0]?.length ?? 0),
      ws.rows[0]?.length ?? 0,
    );
    ws.rows.forEach((row, r) => {
      const cols: Record<number, { v: unknown; s: string }> = {};
      row.forEach((cell, c) => {
        // PreviewCell schema: `{ v: string | number | boolean | null, note? }`
        const value = (cell as { v?: unknown; value?: unknown }).v;
        cols[c] = { v: value ?? '', s: DARK_STYLE_ID };
      });
      cellData[r] = cols;
    });
    sheets[id] = {
      id,
      name: ws.title,
      cellData,
      rowCount,
      columnCount: colCount,
      gridlinesColor: palette.gridline,
      defaultStyle: DARK_STYLE_ID,
      // The first column on a grade sheet is the student name and
      // routinely runs 30+ chars; the default ~88 px column width
      // makes it spill over into the empty number columns. Give
      // column 0 a comfortable width and leave the rest at default.
      columnData: {
        0: { w: 220 },
      },
    };
    sheetOrder.push(id);
  });
  return {
    id: preview.spreadsheet_id,
    name: preview.title ?? 'Spreadsheet',
    appVersion: '1.0.0',
    locale: 'ru-RU',
    styles: {
      // Shared style every cell references via `s`. `cl` = foreground
      // (text), `bg` = background. Univer pairs both with the IRgbColor
      // shape `{ rgb }` (rather than `{ th: themeColor }`).
      [DARK_STYLE_ID]: {
        cl: { rgb: palette.cellFg },
        bg: { rgb: palette.cellBg },
      },
    },
    defaultStyle: DARK_STYLE_ID,
    sheetOrder,
    sheets,
  };
}

export default UniverSpreadsheetPicker;
