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
import { useTranslation } from '@/i18n';
import type {
  PreviewCell,
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

/** One pre-write cell: the backend already matched every student → row
 *  (by ФИО then login) and every ДЗ → column, so the picker just paints
 *  the value at the exact coordinate and highlights it. Nothing is
 *  written to the real Google sheet — this is a "посмотреть глазками"
 *  overlay on the on-page preview only. */
export interface PaintCell {
  /** 0-based row in the preview grid. */
  row: number;
  /** 0-based column in the preview grid. */
  col: number;
  /** Value to drop into the cell. */
  value: string | number;
}

// Highlight for painted (pre-written) cells so they pop against the
// existing values. A warm amber that reads on both light and dark.
const PAINT_BG = '#FDE68A'; // amber-200
const PAINT_FG = '#7c2d12'; // amber-900 — legible on the amber fill

// Minimal shape of a Univer Facade sheet handle we touch when scrolling
// the painted cell into view.
type SheetHandle = {
  getRange: (r: number, c: number, nr: number, nc: number) => unknown;
  setActiveRange?: (range: unknown) => unknown;
};

// Fixed gutter sizes so the dark-mode dimming overlay (below) lines up
// exactly with Univer's row-number / column-letter strips.
const GUTTER_W = 46;
const GUTTER_H = 24;

interface UniverSpreadsheetPickerProps {
  preview: PreviewSpreadsheet;
  selection: SheetSelection | null;
  onSelectionChange: (s: SheetSelection | null) => void;
  /** Pre-write overlay: highlighted grade cells the teacher reviews
   *  before committing. Painted into the preview only (see
   *  {@link PaintCell}). Pass a new array reference to repaint. */
  paintCells?: PaintCell[] | null;
  /** Tab the paint cells belong to (the bound sheet). When omitted the
   *  overlay lands on the first worksheet. */
  paintSheet?: string | null;
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
  paintCells,
  paintSheet,
  height = 420,
}: UniverSpreadsheetPickerProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  // The instance state holds the Univer disposable + the active API
  // handle so we can re-render the workbook when `preview` changes
  // without tearing down + recreating Univer (expensive bootstrap).
  const instanceRef = useRef<{
    dispose: () => void;
    loadPreview: (p: PreviewSpreadsheet) => void;
  } | null>(null);
  // Latest paint overlay, read by loadPreview (which bakes the painted
  // cells into the workbook). Kept in a ref so a fresh mount — e.g. the
  // theme-flip remount — picks up the current overlay synchronously.
  const paintRef = useRef<PaintCell[] | null | undefined>(paintCells);
  paintRef.current = paintCells;
  const paintSheetRef = useRef<string | null | undefined>(paintSheet);
  paintSheetRef.current = paintSheet;
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
          // Bake the pre-write overlay straight into the workbook
          // snapshot: per-cell inline styles are the reliable way to
          // paint colour in Univer (the Facade styling API is flaky
          // across versions), and they survive the theme-flip remount.
          const overlay = paintRef.current ?? null;
          const overlaySheet = paintSheetRef.current ?? null;
          const workbook = univerAPI.createWorkbook(
            previewToWorkbook(p, palette, overlay, overlaySheet),
          );
          // Dark-theme the gutter background + text (the only public knob;
          // Univer paints gutters on canvas). The bright divider LINES it
          // draws have no API — they're dimmed by a DOM overlay in render().
          // Deferred a frame so the render unit is attached before we style.
          const applyHeader = () => {
            try {
              const wb = workbook as unknown as {
                customizeColumnHeader?: (c: unknown) => void;
                customizeRowHeader?: (c: unknown) => void;
              };
              const headerStyle = {
                fontColor: palette.headerFg,
                backgroundColor: palette.headerBg,
              };
              wb.customizeColumnHeader?.({ headerStyle });
              wb.customizeRowHeader?.({ headerStyle });
            } catch {
              /* best-effort */
            }
          };
          // Scroll the first painted cell into view so the teacher SEES
          // where the grades landed without hunting for them.
          const focusPaint = () => {
            const cells = overlay;
            if (!cells || cells.length === 0) return;
            const first = cells.reduce((a, b) => (b.row < a.row ? b : a));
            try {
              const wb = univerAPI.getActiveWorkbook?.() as unknown as {
                getActiveSheet?: () => SheetHandle | null;
                getSheetByName?: (n: string) => SheetHandle | null;
                setActiveSheet?: (s: unknown) => void;
              } | null;
              const sheet =
                (overlaySheet && wb?.getSheetByName?.(overlaySheet)) ||
                wb?.getActiveSheet?.();
              if (!sheet) return;
              try {
                wb?.setActiveSheet?.(sheet);
              } catch {
                /* best-effort */
              }
              sheet.setActiveRange?.(sheet.getRange(first.row, first.col, 1, 1));
            } catch {
              /* best-effort */
            }
          };
          requestAnimationFrame(() => {
            applyHeader();
            focusPaint();
            setTimeout(applyHeader, 200);
          });
        };
        loadPreview(preview);

        instanceRef.current = {
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
            : t('univer_picker.load_error'),
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

  // Theme changes are handled by the parent remounting this component
  // (``key={theme}``) — Univer bakes palette colours into the workbook
  // snapshot and doesn't reliably swap them in place, so a clean
  // re-mount with a fresh palette read is the robust path.

  // NOTE: the pre-write overlay is baked at mount (loadPreview reads the
  // current `paintRef`). We deliberately do NOT re-feed the workbook in
  // place on paint changes — Univer keeps the unit keyed by id and a
  // second createWorkbook with the same id throws ("cannot create a unit
  // with the same unit id"). Instead the parent remounts this component
  // (a paint nonce in its `key`, same trick as the theme flip), which
  // disposes the whole Univer instance and re-bakes cleanly.

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
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/60 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {t('univer_picker.loading')}
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
/** Normalise any CSS colour string into ``#rrggbb``. We can't assume
 *  ``getComputedStyle().color`` is ``rgb()`` anymore — modern Chrome
 *  preserves the authored colour space, and our theme tokens are
 *  ``oklch(...)``, so the old ``rgba?\(`` regex silently missed and we
 *  fell back to a hard-coded *dark* palette in EVERY theme (looked fine
 *  in dark, wrong in light). A 1×1 canvas converts anything the CSS
 *  engine accepts (incl. CSS Color 4 / oklch) into concrete sRGB. */
function cssColorToHex(input: string): string | null {
  if (typeof document === 'undefined' || !input) return null;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return null;
  const SENTINEL = '#010203';
  ctx.fillStyle = SENTINEL;
  try {
    ctx.fillStyle = input;
  } catch {
    return null;
  }
  const out = ctx.fillStyle;
  if (typeof out !== 'string') return null;
  // Unchanged sentinel → canvas rejected the value as unparseable.
  if (out === SENTINEL && input.replace(/\s+/g, '').toLowerCase() !== SENTINEL) {
    return null;
  }
  if (out.startsWith('#')) return out;
  const m = out.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
  if (!m) return null;
  const h = (n: string) => Math.round(Number(n)).toString(16).padStart(2, '0');
  return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
}

function readThemeColor(varName: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;visibility:hidden;color:var(${varName})`;
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  document.body.removeChild(probe);
  return cssColorToHex(computed) ?? fallback;
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
    gridline: lerpHex(cellFg, cellBg, 0.86), // ≈ 14 % fg — subtle, not glary
    headerBg: readThemeColor('--muted', '#1d1f24'),
    headerFg: readThemeColor('--muted-foreground', '#9a9b9f'),
  };
}

const DARK_STYLE_ID = 'plaglens-cell';
const PAINT_STYLE_ID = 'plaglens-paint';

/** Convert backend's compact `PreviewSpreadsheet` into Univer's
 *  workbook snapshot. Univer indexes cells by `[row][col]` with a
 *  `{ v: <primitive>, s?: <styleId> }` value object; we feed `cell.v`
 *  straight through (the backend's `PreviewCell` uses that key) and
 *  attach a style id pointing at the shared theme cell style so the
 *  text is readable on whichever theme is active. Workbook-level
 *  `defaultStyle` alone isn't reliably applied by sheets-ui's
 *  renderer — explicit per-cell `s` is what actually paints text. */
/** Pick a readable text colour (near-black / near-white) for a given
 *  background hex — used when the source cell has a fill but no explicit
 *  text colour, so coloured grade cells stay legible in either theme. */
function contrastText(hex: string): string {
  const m = hex.replace('#', '').match(/.{2}/g);
  if (!m || m.length < 3) return '#111827';
  const [r, g, b] = m.map((h) => parseInt(h, 16));
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#111827' : '#f9fafb';
}

function previewToWorkbook(
  preview: PreviewSpreadsheet,
  palette: DarkPalette,
  paintCells?: PaintCell[] | null,
  paintSheet?: string | null,
): Record<string, unknown> {
  const sheets: Record<string, unknown> = {};
  const sheetOrder: string[] = [];
  preview.worksheets.forEach((ws: PreviewWorksheet, idx: number) => {
    const id = `sheet_${ws.sheet_id ?? idx}`;
    const cellData: Record<number, Record<number, { v: unknown; s: unknown }>> =
      {};
    // Does the pre-write overlay belong to this tab? When no sheet is
    // named, the first worksheet takes it.
    const isPaintTarget =
      !!paintCells &&
      paintCells.length > 0 &&
      (paintSheet ? ws.title === paintSheet : idx === 0);
    const overlay = isPaintTarget ? paintCells! : [];
    // Size the grid to the data we actually LOADED, not the sheet's full
    // allocation (``col_count`` is often far larger — a gradebook may
    // reserve 200 columns) — otherwise Univer paints a sea of empty cells
    // past the fetched edge. Paint cells below extend it if needed.
    let rowCount = ws.rows.length || 1;
    let colCount = ws.rows.reduce((m, r) => Math.max(m, r.length), 0) || 1;
    for (const pc of overlay) {
      if (pc.row + 1 > rowCount) rowCount = pc.row + 1;
      if (pc.col + 1 > colCount) colCount = pc.col + 1;
    }
    ws.rows.forEach((row, r) => {
      const cols: Record<number, { v: unknown; s: unknown }> = {};
      row.forEach((cell: PreviewCell, c) => {
        const value = cell?.v;
        // Mirror source formatting: a non-default fill (conditional
        // formats, header bands) or bold becomes an inline style; plain
        // cells ride the shared theme style so empty area still follows
        // the app's light/dark theme.
        let s: unknown = DARK_STYLE_ID;
        if (cell?.bg) {
          s = {
            bg: { rgb: cell.bg },
            cl: { rgb: cell.fg ?? contrastText(cell.bg) },
            bl: cell.bold ? 1 : 0,
          };
        } else if (cell?.bold) {
          s = {
            bg: { rgb: palette.cellBg },
            cl: { rgb: cell.fg ?? palette.cellFg },
            bl: 1,
          };
        }
        cols[c] = { v: value ?? '', s };
      });
      cellData[r] = cols;
    });

    // Bake the pre-write overlay: drop each matched grade at its exact
    // (row, col) with the amber highlight so the teacher sees precisely
    // where «Записать в таблицу» will land — nothing leaves the page.
    for (const pc of overlay) {
      const rowCols = cellData[pc.row] ?? {};
      rowCols[pc.col] = { v: pc.value, s: PAINT_STYLE_ID };
      cellData[pc.row] = rowCols;
    }

    // Column widths straight from the source sheet (clamped so a stray
    // giant column can't blow out the embed). Fall back to a comfortable
    // name column when the sheet didn't report widths.
    const columnData: Record<number, { w: number }> = {};
    const widths = ws.col_widths ?? [];
    if (widths.length) {
      widths.forEach((w, i) => {
        if (w && w > 0) columnData[i] = { w: Math.min(Math.max(w, 32), 480) };
      });
    } else {
      columnData[0] = { w: 220 };
    }

    sheets[id] = {
      id,
      name: ws.title,
      cellData,
      rowCount,
      columnCount: colCount,
      gridlinesColor: palette.gridline,
      defaultStyle: DARK_STYLE_ID,
      columnData,
      // Pin gutter sizes so the dark-mode dimming overlay aligns exactly.
      rowHeader: { width: GUTTER_W },
      columnHeader: { height: GUTTER_H },
    };
    sheetOrder.push(id);
  });
  return {
    id: preview.spreadsheet_id,
    name: preview.title ?? 'Spreadsheet',
    appVersion: '1.0.0',
    locale: 'ru-RU',
    styles: {
      // Shared style every plain cell references via `s`. `cl` =
      // foreground (text), `bg` = background.
      [DARK_STYLE_ID]: {
        cl: { rgb: palette.cellFg },
        bg: { rgb: palette.cellBg },
      },
      // Pre-write highlight — amber fill + dark amber text, bold so the
      // freshly placed grades read as "not yet committed".
      [PAINT_STYLE_ID]: {
        cl: { rgb: PAINT_FG },
        bg: { rgb: PAINT_BG },
        bl: 1,
      },
    },
    defaultStyle: DARK_STYLE_ID,
    sheetOrder,
    sheets,
  };
}

export default UniverSpreadsheetPicker;
