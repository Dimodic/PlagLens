/**
 * Wraps a code block with a header showing file name and language.
 *
 * When `compact=true` (single-file submissions), drops the header — there is
 * no file tree to disambiguate from and a filename like
 * `submission-142902814.txt` is just noise. Syntax highlighting is on by
 * default via the in-repo tokeniser (no external deps).
 *
 * When `annotations` is provided, switches to line-by-line rendering with
 * gutter line numbers and inline comment cards attached to specific lines
 * (GitHub PR review style).
 */
import { Eye, EyeOff, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/i18n';
import { tokenize, SEGMENT_CLASS, type Segment } from './highlight';
import { cn } from '@/components/ui/utils';

export interface CodeAnnotation {
  /** 1-indexed line where the comment card is anchored. */
  line: number;
  /** Highlight range (inclusive). Defaults to [line, line]. */
  range?: [number, number];
  severity: 'low' | 'medium' | 'high';
  /** What produced this note. AI signals get the severity dot;
   *  teacher notes get a quieter pencil mark instead — they're peers
   *  in the gutter but they aren't risk signals. */
  kind?: 'ai' | 'teacher';
  /** Feedback row id — used to wire edit / delete / visibility actions
   *  for teacher notes. AI signals don't have a corresponding row. */
  id?: string;
  /** Current student-visibility state. Drives the eye-icon toggle. */
  visibleToStudent?: boolean;
  title: string;
  body: string;
}

interface CodeViewerProps {
  fileName: string;
  language?: string;
  code: string;
  sizeBytes?: number;
  /** Caps the code block height with an inner scroll. Pass `'none'` to render
   * the full code without a max height. */
  maxHeight?: number | 'none';
  /** Hide the file-name header (use when there is only one file). */
  compact?: boolean;
  /** Inline review-style comments anchored to lines. When present, switches
   * to line-by-line rendering with a gutter. */
  annotations?: CodeAnnotation[];
  /** Called when the grader clicks the "+" affordance on a line. The
   * page owns the draft state — CodeViewer just emits the line number. */
  onAddComment?: (line: number) => void;
  /** Renders inside the per-line annotation block. Use it to mount a
   * "new comment" form when {@link onAddComment} fires. */
  composerForLine?: number | null;
  renderComposer?: (line: number) => React.ReactNode;
  /** Teacher-note actions. Each fires with the feedback row id taken
   *  from the annotation. Edit hands off to {@link renderComposer} by
   *  way of {@link editingFeedbackId} — the parent owns the draft text. */
  onEditTeacherNote?: (id: string, currentBody: string) => void;
  editingFeedbackId?: string | null;
  renderTeacherEditor?: (id: string) => React.ReactNode;
  onDeleteTeacherNote?: (id: string) => void;
  onToggleTeacherNoteVisibility?: (id: string, nextVisible: boolean) => void;
  /** Disables the action buttons while a mutation is in flight. */
  teacherNoteActionsBusyFor?: string | null;
}

/** Map verbose YC / compiler ids ("clang14_cpp20", "cpp20-make-clang14",
 *  "python_3.8") to one of the four short labels we surface in the UI.
 *  Anything we don't recognise falls back to the raw token. */
function shortLang(raw: string | undefined): string {
  if (!raw) return '';
  const lower = raw.toLowerCase();
  if (/(?:^|[^a-z])(c\+\+|cpp\d*|gcc|clang|g\+\+)/.test(lower)) return 'cpp';
  if (/(?:^|[^a-z])(py|python)\d*/.test(lower)) return 'python';
  if (/(?:^|[^a-z])(java)\d*/.test(lower) && !lower.startsWith('javascript'))
    return 'java';
  if (/(?:^|[^a-z])(c#|csharp|dotnet|mono)/.test(lower)) return 'c#';
  if (/(?:^|[^a-z])go\d*/.test(lower)) return 'go';
  if (/(?:^|[^a-z])(rust|rustc)/.test(lower)) return 'rust';
  if (/(?:^|[^a-z])(node|js|javascript)/.test(lower)) return 'js';
  if (/(?:^|[^a-z])(ts|typescript)/.test(lower)) return 'ts';
  if (/(?:^|[^a-z])kotlin/.test(lower)) return 'kotlin';
  if (/(?:^|[^a-z])swift/.test(lower)) return 'swift';
  if (/(?:^|[^a-z])(plain|text)/.test(lower)) return 'text';
  // Unknown — return the raw label trimmed to something compact.
  return raw.replace(/^[a-z]+\d*[_-]?/i, '').slice(0, 12) || raw;
}

const EXT_LANG: Record<string, string> = {
  py: 'python',
  js: 'javascript',
  ts: 'typescript',
  tsx: 'tsx',
  jsx: 'jsx',
  java: 'java',
  cpp: 'cpp',
  cc: 'cpp',
  c: 'c',
  h: 'c',
  hpp: 'cpp',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  cs: 'csharp',
  kt: 'kotlin',
  php: 'php',
  swift: 'swift',
  md: 'markdown',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  sh: 'bash',
  sql: 'sql',
};

function detectLang(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return 'plaintext';
  return EXT_LANG[name.slice(dot + 1).toLowerCase()] ?? 'plaintext';
}

/** Split tokenised segments into per-line arrays so we can render each line
 * as its own row (needed for a gutter + per-line annotation anchors). */
function splitSegmentsByLine(segments: Segment[]): Segment[][] {
  const lines: Segment[][] = [[]];
  for (const seg of segments) {
    const parts = seg.text.split('\n');
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) lines.push([]);
      if (parts[i].length > 0) {
        lines[lines.length - 1].push({ kind: seg.kind, text: parts[i] });
      }
    }
  }
  return lines;
}

// Annotation styling is intentionally quiet — a thin coloured left rule
// carries severity, with a faint tint, instead of a boxed card with a full
// border that competes with the code. Palette matches the status palette:
// sky=info, amber=warning, red=destructive.
const SEV_BORDER: Record<CodeAnnotation['severity'], string> = {
  low: 'border-l-sky-500/70',
  medium: 'border-l-amber-500/70',
  high: 'border-l-red-500/70',
};

export function CodeViewer({
  fileName,
  language,
  code,
  maxHeight = 600,
  compact = false,
  annotations,
  onAddComment,
  composerForLine,
  renderComposer,
  onEditTeacherNote,
  editingFeedbackId,
  renderTeacherEditor,
  onDeleteTeacherNote,
  onToggleTeacherNoteVisibility,
  teacherNoteActionsBusyFor,
}: CodeViewerProps) {
  const lang = language ?? detectLang(fileName);
  const segments = tokenize(code, lang);
  const hasAnnotations = !!annotations && annotations.length > 0;
  // We render the line-by-line gutter view as soon as inline comments
  // are possible — whether they exist now (annotations) or could be
  // added (onAddComment is wired up). That makes the "+" affordance
  // available on every line, not only the ones the LLM flagged.
  const useGutter = hasAnnotations || !!onAddComment;
  const wrapperStyle = maxHeight === 'none' ? undefined : { maxHeight };
  // Short language tag (cpp / python / java …) anchored to the top-right
  // corner inside the code panel. The synthetic filename and verbose
  // compiler id are dropped — they don't help the grader.
  const langChip = !compact && (
    <span
      data-testid="submission-code-viewer-language"
      className="pointer-events-none absolute right-3 top-2 text-xs text-muted-foreground/70 select-none"
    >
      {shortLang(lang)}
    </span>
  );

  return (
    <div
      className="space-y-2"
      data-testid="submission-code-viewer"
      data-language={lang}
      data-filename={fileName}
    >
      {useGutter ? (
        <div className="relative">
          {langChip}
          <AnnotatedCode
            segments={segments}
            annotations={annotations ?? []}
            maxHeightStyle={wrapperStyle}
            onAddComment={onAddComment}
            composerForLine={composerForLine}
            renderComposer={renderComposer}
            onEditTeacherNote={onEditTeacherNote}
            editingFeedbackId={editingFeedbackId}
            renderTeacherEditor={renderTeacherEditor}
            onDeleteTeacherNote={onDeleteTeacherNote}
            onToggleTeacherNoteVisibility={onToggleTeacherNoteVisibility}
            teacherNoteActionsBusyFor={teacherNoteActionsBusyFor}
          />
        </div>
      ) : (
        <div className="relative">
          {langChip}
          <pre
            className="font-mono text-sm bg-muted p-4 rounded-md overflow-auto leading-relaxed"
            style={wrapperStyle}
          >
            <code>
              {segments.map((seg, idx) => {
                const cls = SEGMENT_CLASS[seg.kind];
                return cls ? (
                  <span key={idx} className={cn(cls)}>
                    {seg.text}
                  </span>
                ) : (
                  <span key={idx}>{seg.text}</span>
                );
              })}
            </code>
          </pre>
        </div>
      )}
    </div>
  );
}

interface AnnotatedCodeProps {
  segments: Segment[];
  annotations: CodeAnnotation[];
  maxHeightStyle: React.CSSProperties | undefined;
  onAddComment?: (line: number) => void;
  composerForLine?: number | null;
  renderComposer?: (line: number) => React.ReactNode;
  onEditTeacherNote?: (id: string, currentBody: string) => void;
  editingFeedbackId?: string | null;
  renderTeacherEditor?: (id: string) => React.ReactNode;
  onDeleteTeacherNote?: (id: string) => void;
  onToggleTeacherNoteVisibility?: (id: string, nextVisible: boolean) => void;
  teacherNoteActionsBusyFor?: string | null;
}

function AnnotatedCode({
  segments,
  annotations,
  maxHeightStyle,
  onAddComment,
  composerForLine,
  renderComposer,
  onEditTeacherNote,
  editingFeedbackId,
  renderTeacherEditor,
  onDeleteTeacherNote,
  onToggleTeacherNoteVisibility,
  teacherNoteActionsBusyFor,
}: AnnotatedCodeProps) {
  const { t } = useTranslation();
  const lines = splitSegmentsByLine(segments);

  // Index annotations by their anchor line. We dropped the per-line
  // background tint because it made the code itself unreadable; severity
  // now lives only inside the comment card via a small dot.
  const byAnchor = new Map<number, CodeAnnotation[]>();
  for (const ann of annotations) {
    const arr = byAnchor.get(ann.line) ?? [];
    arr.push(ann);
    byAnchor.set(ann.line, arr);
  }

  const gutterWidth = String(lines.length).length;

  return (
    <div
      className="rounded-md bg-muted font-mono text-sm leading-relaxed overflow-auto"
      style={maxHeightStyle}
    >
      <div className="py-2">
        {lines.map((segs, idx) => {
          const lineNumber = idx + 1;
          const anns = byAnchor.get(lineNumber);
          return (
            <div key={lineNumber}>
              {/* GitHub-style row: subtle hover bg, "+" button fades in
                  to the left of the gutter. Severity tints are gone from
                  the row itself — the comment card carries them. */}
              <div className="group relative flex items-start gap-3 px-4 pl-10 hover:bg-muted-foreground/[0.04] transition-colors">
                {onAddComment && (
                  <button
                    type="button"
                    onClick={() => onAddComment(lineNumber)}
                    aria-label={t('code_viewer.add_comment')}
                    className="absolute left-1.5 top-1/2 hidden h-5 w-5 -translate-y-1/2 items-center justify-center rounded bg-primary text-primary-foreground text-xs leading-none opacity-0 transition-opacity group-hover:flex group-hover:opacity-100 focus-visible:opacity-100 focus-visible:flex"
                  >
                    +
                  </button>
                )}
                <span
                  className="select-none text-right text-muted-foreground/60 tabular-nums shrink-0"
                  style={{ width: `${gutterWidth}ch` }}
                >
                  {lineNumber}
                </span>
                <code className="min-w-0 whitespace-pre">
                  {segs.length === 0 ? (
                    ' '
                  ) : (
                    segs.map((seg, i) => {
                      const cls = SEGMENT_CLASS[seg.kind];
                      return cls ? (
                        <span key={i} className={cn(cls)}>
                          {seg.text}
                        </span>
                      ) : (
                        <span key={i}>{seg.text}</span>
                      );
                    })
                  )}
                </code>
              </div>
              {anns?.map((ann, i) => {
                const [from, to] = ann.range ?? [ann.line, ann.line];
                const rangeLabel =
                  from === to
                    ? t('code_viewer.line_single', { from })
                    : t('code_viewer.line_range', { from, to });
                const isTeacher = ann.kind === 'teacher';
                // AI signals also expose edit / delete / visibility via
                // the same callbacks (the page dispatches on the id
                // prefix), so we don't gate on kind here.
                const isEditingThis =
                  ann.id != null && ann.id === editingFeedbackId;
                const busyThis =
                  ann.id != null && ann.id === teacherNoteActionsBusyFor;
                // Edit mode: hand off to the parent-supplied editor so
                // the page owns the draft state (same pattern as the
                // "+" composer). Falls through to the read-only card if
                // no editor was provided.
                if (isEditingThis && renderTeacherEditor && ann.id) {
                  return (
                    <div
                      key={ann.id}
                      className="mx-10 my-2 max-w-full font-sans"
                    >
                      {renderTeacherEditor(ann.id)}
                    </div>
                  );
                }
                return (
                  // Quiet inline comment card. Spec from design-system.md:
                  //   * outlined card, no shadow, `border-border/50`
                  //   * `text-sm` body, `text-xs text-muted-foreground` meta
                  //   * font-mono only for true code (we drop it for line
                  //     references — they read fine as prose)
                  // Teacher notes use a pencil glyph; AI notes use a
                  // severity dot. That single visual difference is enough
                  // to tell them apart without a second label.
                  <div
                    key={ann.id ?? `ann-${i}`}
                    data-annotation-kind={ann.kind ?? 'ai'}
                    className={cn(
                      // Recessed darker card (contrasts the bg-muted code
                      // panel so it reads as grounded, not floating) with a
                      // thin severity stripe on the left.
                      'group/ann mx-10 my-1.5 rounded-md border-l-2 bg-background/70 py-2 pl-3 pr-3 font-sans',
                      isTeacher
                        ? 'border-l-border'
                        : SEV_BORDER[ann.severity],
                    )}
                  >
                    <div className="flex items-center gap-2 text-xs">
                      {isTeacher && (
                        <Pencil className="h-3 w-3 shrink-0 text-muted-foreground/80" />
                      )}
                      <span className="font-medium text-foreground/90">
                        {ann.title}
                      </span>
                      <span aria-hidden className="text-muted-foreground/40">
                        ·
                      </span>
                      <span className="lowercase text-muted-foreground">
                        {rangeLabel}
                      </span>
                      {/* Teacher action row in the top-right. Both AI
                          signals and teacher-authored notes get the
                          same three icons — the parent (SubmissionDetail
                          page) dispatches on the `ai:` / raw-id prefix
                          to do the right thing (materialise AI signal
                          → feedback, or PATCH/DELETE the feedback row).
                          Hidden by default; fades in on card hover so
                          the meta line stays calm during reading. */}
                      {ann.id && (
                        <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity group-hover/ann:opacity-100 focus-within:opacity-100">
                          {onToggleTeacherNoteVisibility && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              disabled={busyThis}
                              onClick={() =>
                                onToggleTeacherNoteVisibility(
                                  ann.id!,
                                  !ann.visibleToStudent,
                                )
                              }
                              aria-label={
                                ann.visibleToStudent
                                  ? t('code_viewer.hide_from_student')
                                  : t('code_viewer.show_to_student')
                              }
                              data-testid={`annotation-toggle-visible-${ann.id}`}
                              data-visible={
                                ann.visibleToStudent ? 'true' : 'false'
                              }
                              className={cn(
                                'h-6 w-6 hover:text-foreground',
                                ann.visibleToStudent
                                  ? 'text-foreground/80'
                                  : 'text-muted-foreground/70',
                              )}
                            >
                              {ann.visibleToStudent ? (
                                <Eye className="h-3.5 w-3.5" />
                              ) : (
                                <EyeOff className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          )}
                          {onEditTeacherNote && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              disabled={busyThis}
                              onClick={() =>
                                onEditTeacherNote(ann.id!, ann.body)
                              }
                              aria-label={t('code_viewer.edit_note')}
                              data-testid={`annotation-edit-${ann.id}`}
                              className="h-6 w-6 text-muted-foreground/70 hover:text-foreground"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {onDeleteTeacherNote && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              disabled={busyThis}
                              onClick={() => onDeleteTeacherNote(ann.id!)}
                              aria-label={t('code_viewer.delete_note')}
                              data-testid={`annotation-delete-${ann.id}`}
                              className="h-6 w-6 text-muted-foreground/70 hover:text-foreground"
                            >
                              {busyThis ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed whitespace-pre-wrap text-foreground/80">
                      {ann.body}
                    </p>
                  </div>
                );
              })}
              {composerForLine === lineNumber && renderComposer && (
                // Inline composer sits in the gutter just like a comment
                // card. We let the composer set its own max-width so the
                // box doesn't span the entire code panel — short notes are
                // the norm, not paragraphs.
                <div className="mx-10 my-2 max-w-full font-sans">
                  {renderComposer(lineNumber)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
