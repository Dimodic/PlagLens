/**
 * SubmissionDetailPage — fits everything on one screen: hero row
 * (code + grade rail) + a compact 3-column grid for plagiarism, AI summary
 * and flags. AI risk signals with line ranges are rendered as GitHub-style
 * inline comments anchored to the code. A single header action ("Запустить
 * анализ") starts both the plagiarism run and the LLM analysis in parallel.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { submissionsApi } from '@/api/endpoints/submissions';
import { submissionKeys } from '@/hooks/api/useSubmissions';
import {
  Sparkles,
  Loader2,
  ChevronLeft,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { sanitizeHtml } from '@/utils/sanitizeHtml';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Page } from '@/components/layout/Page';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  useAddFeedback,
  useDeleteFeedback,
  useFeedback,
  useGrade,
  useGradeHistory,
  useLatestPerStudent,
  usePatchFeedback,
  usePublishFeedback,
  useSetGrade,
  useDeleteGrade,
  useSubmission,
  useSubmissionFiles,
  useSubmissionFileContent,
  useSubmissionHistory,
} from '@/hooks/api/useSubmissions';
import { useAssignment } from '@/hooks/api/useAssignments';
import {
  useClusters,
  usePairs,
  usePlagiarismRuns,
  useRunPlagiarism,
} from '@/hooks/api/usePlagiarism';
import {
  useAnalyses,
  useLatestAnalysis,
  useStartAnalysis,
} from '@/hooks/api/useAi';
import type { AIAnalysis, RiskSignal } from '@/api/endpoints/ai';
import { useAuth } from '@/auth/useAuth';
import { hasCourseRole, hasGlobalRole } from '@/auth/RoleGuard';
import { FileTreeViewer } from '@/components/submissions/FileTreeViewer';
import {
  CodeViewer,
  type CodeAnnotation,
} from '@/components/submissions/CodeViewer';
import { GradeForm, GradeDisplay } from '@/components/submissions/GradeForm';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { StatusPill } from '@/components/common/StatusPill';
import { ClusterMapView } from '@/components/plagiarism/ClusterMapView';
import { PairDiffInline } from '@/components/plagiarism/PairDiffInline';
import type { PlagiarismRun } from '@/api/endpoints/plagiarism';
import { cn } from '@/components/ui/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useNotifications } from '@/hooks/useNotifications';
import { parseProblem } from '@/api/problem';
import { formatDateTime } from '@/utils/formatters';
import type { Problem } from '@/api/types';
import { displayAuthor } from '@/api/endpoints/submissions';
import type { SubmissionFile } from '@/api/endpoints/submissions';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const RISK_TYPE_LABEL: Record<RiskSignal['type'], string> = {
  style_jump: 'Скачок стиля',
  generic_solution: 'Шаблонное решение',
  non_idiomatic: 'Не идиоматично',
  complexity_jump: 'Скачок сложности',
  library_misuse: 'Неправильное использование библиотеки',
  stub_code: 'Заглушка',
  other: 'Другое',
};

export default function SubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const notify = useNotifications();
  const [problem, setProblem] = useState<Problem | null>(null);

  const { data: submission, isLoading } = useSubmission(id);
  const { data: assignment } = useAssignment(submission?.assignment_id);
  // Peer-navigation list for the "Предыдущая / Следующая" buttons. We pull
  // the latest-per-student feed (one row per author, their current
  // attempt) rather than every version of every submission — the grader
  // shouldn't have to chain through 5 attempts of the same student before
  // moving on. Earlier versions of the current student stay reachable
  // through the version popover at the top of the page.
  //
  // Edge case: if the grader landed on an *older* version via that
  // popover, ``submission.id`` won't be in ``peerIds`` (peers only
  // carries latest). We then locate the position by author_id so the
  // ‹ / › buttons still walk to the next *student*, not into the void.
  const { data: peers } = useLatestPerStudent(submission?.assignment_id);
  const peerIds = useMemo(
    () => (peers?.data ?? []).map((s) => s.id),
    [peers],
  );
  const peerIndex = useMemo(() => {
    if (!id) return -1;
    const direct = peerIds.indexOf(id);
    if (direct >= 0) return direct;
    // Current submission is an older version — match the row whose
    // latest belongs to the same author.
    if (!submission) return -1;
    return (peers?.data ?? []).findIndex(
      (p) => p.author_id === submission.author_id,
    );
  }, [peerIds, id, peers, submission]);
  const prevPeerId =
    peerIndex > 0 ? peerIds[peerIndex - 1] : null;
  const nextPeerId =
    peerIndex >= 0 && peerIndex < peerIds.length - 1
      ? peerIds[peerIndex + 1]
      : null;

  // Prefetch the previous + next submissions (detail + files + first
  // file's text) as soon as we know which they are. By the time the
  // grader clicks ‹ / ›, the data is already warm in React Query cache
  // and the view swaps without the 2-3 second sequential request chain
  // (submission → files → content) that produced the visible delay.
  const queryClient = useQueryClient();
  // Prefetch on a 400 ms timer rather than synchronously on every
  // prev/next change. Rapid back/forward clicks would otherwise stack
  // up dozens of /submissions/{id}, /files, /content requests behind
  // the browser's 6-connection HTTP/1.1 limit — the symptom is a
  // page that takes nearly a minute to settle after you mash ‹ ten
  // times in a row. With the timer, only the position the grader
  // actually paused on triggers prefetch; the in-between rows are
  // skipped entirely.
  useEffect(() => {
    const targets = [prevPeerId, nextPeerId].filter(
      (x): x is string => !!x,
    );
    if (targets.length === 0) return;
    const timer = setTimeout(() => {
      for (const sid of targets) {
        void queryClient.prefetchQuery({
          queryKey: submissionKeys.detail(sid),
          queryFn: () => submissionsApi.get(sid),
        });
        // After files land, also fire-and-forget a fetch for the first
        // file's content. We use .ensureQueryData (a thin no-cache-bust
        // wrapper) so a re-render doesn't re-trigger the network call.
        void (async () => {
          try {
            const fp = await queryClient.ensureQueryData({
              queryKey: submissionKeys.files(sid),
              queryFn: () => submissionsApi.listFiles(sid),
            });
            const firstFileId = fp?.data?.[0]?.id;
            if (firstFileId) {
              void queryClient.prefetchQuery({
                queryKey: submissionKeys.fileContent(sid, firstFileId),
                queryFn: () =>
                  submissionsApi.getFileContent(sid, firstFileId),
              });
            }
          } catch {
            // best-effort — if any of these fail the click path will
            // re-fetch normally.
          }
        })();
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [prevPeerId, nextPeerId, queryClient]);
  const { data: filesPage, isPlaceholderData: filesIsStale } =
    useSubmissionFiles(id);
  // Version history is fetched lazily — the popover trigger toggles
  // this on first open. Keeps a connection slot free for the
  // critical-path requests (submission + files + content + grade)
  // when the page mounts.
  const [versionPopoverOpened, setVersionPopoverOpened] = useState(false);
  const { data: history } = useSubmissionHistory(id, {
    enabled: versionPopoverOpened,
  });
  const { data: gradeRaw } = useGrade(id);
  // Same cross-submission bleed defence we use for AI analyses and
  // feedback: only trust the grade if it actually belongs to the URL
  // submission. Guards against React Query (or a misbehaving cache
  // adapter) ever surfacing a previously-viewed submission's grade in
  // the brief window between navigate() and the new query landing.
  const grade = useMemo(
    () =>
      gradeRaw && id && gradeRaw.submission_id === id ? gradeRaw : undefined,
    [gradeRaw, id],
  );
  const { data: latestAnalysis } = useLatestAnalysis(id);
  // All analyses for this submission, newest first — drives the "1/N"
  // version navigator next to "AI-анализ".
  const { data: analysesPage } = useAnalyses(id, { limit: 50 });

  const setGrade = useSetGrade(id ?? '');
  const deleteGrade = useDeleteGrade(id ?? '');
  const startAnalysis = useStartAnalysis(id ?? '');
  const runPlag = useRunPlagiarism(
    submission?.assignment_id ?? '',
    submission?.course_id ?? undefined,
  );

  const { data: plagRuns } = usePlagiarismRuns(submission?.assignment_id ?? '', {
    limit: 5,
  });
  const latestRun = useMemo(() => {
    const list = plagRuns?.data ?? [];
    return list.find((r) => r.status === 'completed') ?? list[0] ?? null;
  }, [plagRuns]);
  const { data: pairsPage } = usePairs(latestRun?.id, { limit: 200 });
  // Pill count must match what the grader actually sees as
  // "highlighted" edges on the map. Touches (< 0.5 similarity) are
  // rendered as hair-thin grey lines and read as noise — counting
  // them inflates the pill number and leaves the teacher staring at
  // the map asking "where are my 7?". Filter to partial+ matches so
  // pill = visible coloured edges.
  const PILL_MIN_SIMILARITY = 0.5;
  const pairsForSubmission = useMemo(() => {
    if (!id) return [];
    return (pairsPage?.data ?? []).filter(
      (p) =>
        (p.a_submission_id === id || p.b_submission_id === id) &&
        p.similarity >= PILL_MIN_SIMILARITY,
    );
  }, [pairsPage, id]);

  // Grade history sits inside a collapsed accordion — defer the
  // request until the teacher actually expands it.
  const [gradeHistoryOpened, setGradeHistoryOpened] = useState(false);
  const { data: gradeHistory, error: gradeHistoryError } = useGradeHistory(
    id,
    { enabled: gradeHistoryOpened },
  );

  const [selectedFile, setSelectedFile] = useState<SubmissionFile | null>(null);
  // Index of the analysis currently visible in the AI section (0 = newest).
  // Reset to 0 when a fresh run lands on top of the list.
  const [analysisIdx, setAnalysisIdx] = useState(0);
  const analysisList = useMemo(
    () => analysesPage?.data ?? [],
    [analysesPage],
  );
  // Cross-submission bleed defence.
  //
  // After navigate(…/submissions/NEW), several things can briefly point
  // at the previous submission's data:
  //   * useSubmission has `placeholderData: prev` so `submission` holds
  //     the old row until the new fetch resolves.
  //   * The AI service can cache reports by code hash and return rows
  //     whose ``submission_id`` doesn't match the URL — looking at the
  //     wire, ``/submissions/B/ai-analyses/latest`` is correctly scoped,
  //     but if React Query (or a misbehaving cache adapter) ever served
  //     a stale entry from a prior key the report would slip through.
  //
  // The strict invariant: only treat an analysis as "current" when its
  // own ``submission_id`` equals the URL id we're rendering. Anything
  // else is a stale leak — drop it.
  const currentAnalysis: AIAnalysis | null = useMemo(() => {
    const matchesUrl = (a: AIAnalysis | null | undefined): a is AIAnalysis =>
      !!a && !!id && a.submission_id === id;
    if (analysisList.length > 0) {
      const idx = Math.min(analysisIdx, analysisList.length - 1);
      const picked = analysisList[idx] ?? null;
      if (matchesUrl(picked)) return picked;
    }
    if (matchesUrl(latestAnalysis)) return latestAnalysis;
    return null;
  }, [id, analysisList, analysisIdx, latestAnalysis]);
  // When a brand-new analysis arrives at index 0, snap back to it so the
  // user actually sees their just-fired run instead of staying on the page
  // they were browsing.
  useEffect(() => {
    if (
      analysisList.length > 0 &&
      latestAnalysis &&
      analysisList[0]?.id === latestAnalysis.id
    ) {
      setAnalysisIdx(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestAnalysis?.id]);

  /** Stable hash for an AI risk signal — used as the "id" for that
   *  annotation and as the localStorage key for teacher dismissals.
   *  Includes severity + line range + a leading slice of the details so
   *  two near-identical signals on different lines don't collide. */
  const aiSignalKey = (s: RiskSignal): string => {
    const range = s.line_range ? s.line_range.join('-') : 'none';
    return `${s.type}|${s.severity}|${range}|${s.details.slice(0, 64)}`;
  };

  // Teacher dismissals for AI signals. When the teacher acts on an AI
  // annotation (eye / pencil / trash), we tombstone it locally so the
  // signal disappears from the code view — otherwise the freshly-made
  // teacher feedback would show alongside the original AI signal that
  // spawned it. localStorage scopes by submission so the tombstones
  // survive a reload.
  const dismissedStorageKey = id ? `plaglens.ai.dismissed.${id}` : '';
  const [dismissedAi, setDismissedAi] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!id) {
      setDismissedAi(new Set());
      return;
    }
    try {
      const raw = localStorage.getItem(`plaglens.ai.dismissed.${id}`);
      setDismissedAi(raw ? new Set(JSON.parse(raw) as string[]) : new Set());
    } catch {
      setDismissedAi(new Set());
    }
  }, [id]);
  const dismissAiSignal = (key: string) => {
    setDismissedAi((prev) => {
      const next = new Set(prev);
      next.add(key);
      if (dismissedStorageKey) {
        try {
          localStorage.setItem(dismissedStorageKey, JSON.stringify([...next]));
        } catch {
          /* localStorage full or disabled — UI still works in-session */
        }
      }
      return next;
    });
  };

  /** Map LLM risk signals with `line_range` onto code annotations so the
   * code viewer can render GitHub-style inline comment cards. Signals
   * without a line range stay in the AI summary section below.
   * Signals tombstoned by the teacher are filtered out. */
  const aiAnnotations = useMemo<CodeAnnotation[]>(() => {
    const signals = currentAnalysis?.report?.risk_signals ?? [];
    return signals
      .filter((s): s is RiskSignal & { line_range: [number, number] } =>
        Array.isArray(s.line_range) && s.line_range.length === 2,
      )
      .filter((s) => !dismissedAi.has(aiSignalKey(s)))
      .map((s) => {
        const [from, to] = s.line_range;
        return {
          line: to,
          range: [from, to] as [number, number],
          severity: s.severity,
          kind: 'ai' as const,
          // Use `ai:` prefix so the teacher-note action callbacks can
          // discriminate AI vs persisted-feedback ids at the call site.
          id: `ai:${aiSignalKey(s)}`,
          title: RISK_TYPE_LABEL[s.type] ?? s.type,
          body: s.details,
        };
      });
  }, [currentAnalysis, dismissedAi]);

  // Teacher-authored inline comments live in the feedback API. We
  // encode the anchor line as a leading "[L<N>] " prefix in the body
  // — quick + compatible with the existing submission_feedback table
  // without any schema change. Anything not matching the prefix is
  // a free-form feedback note and shown in the side panel only.
  const { data: feedbacks } = useFeedback(id);
  const addFeedback = useAddFeedback(id ?? '');
  const teacherAnnotations = useMemo<CodeAnnotation[]>(() => {
    const items = feedbacks?.data ?? [];
    const out: CodeAnnotation[] = [];
    for (const f of items) {
      // Same invariant as currentAnalysis: never render a feedback whose
      // submission_id doesn't match the URL we're on. Guards against a
      // stale cache entry leaking the previous student's note in.
      if (!id || f.submission_id !== id) continue;
      const m = f.body.match(/^\[L(\d+)\]\s*(.*)$/s);
      if (!m) continue;
      const line = Number(m[1]);
      if (!Number.isFinite(line) || line <= 0) continue;
      out.push({
        line,
        severity: 'low',
        kind: 'teacher',
        id: f.id,
        visibleToStudent: f.visible_to_student,
        title: 'Заметка проверяющего',
        body: m[2],
      });
    }
    return out;
  }, [feedbacks, id]);
  const codeAnnotations = useMemo<CodeAnnotation[]>(
    () => [...teacherAnnotations, ...aiAnnotations],
    [teacherAnnotations, aiAnnotations],
  );

  // Inline composer state — single open form at a time. When the grader
  // clicks the "+" on a line we open a tiny textarea right under that
  // line; submit POSTs `[L<N>] <text>` via the feedback API.
  const [composerLine, setComposerLine] = useState<number | null>(null);
  const [composerText, setComposerText] = useState('');

  // Grade rail mode: once a grade is set, render it read-only. The
  // teacher must explicitly click the pencil to open the form again.
  // Reset to display on submission switch so chaining ‹/› doesn't drop
  // us into an open form for the next student.
  const [editingGrade, setEditingGrade] = useState(false);
  // Plagiarism cluster map modal — opened by clicking the pill so the
  // grader can peek at who's tied to whom without leaving the
  // submission page they were on.
  const [plagMapOpen, setPlagMapOpen] = useState(false);
  useEffect(() => {
    // Reset all "user opened this lazy section" flags on submission
    // switch — otherwise the next student's page would eagerly fire
    // the deferred queries we just stopped firing automatically.
    setEditingGrade(false);
    setVersionPopoverOpened(false);
    setGradeHistoryOpened(false);
    setPlagMapOpen(false);
  }, [id]);
  const submitComposer = async () => {
    const line = composerLine;
    const text = composerText.trim();
    if (line == null || !text) {
      setComposerLine(null);
      setComposerText('');
      return;
    }
    try {
      await addFeedback.mutateAsync({
        body: `[L${line}] ${text}`,
        visible_to_student: false,
      });
      setComposerLine(null);
      setComposerText('');
    } catch (e) {
      setProblem(parseProblem(e));
    }
  };

  // Edit / delete / visibility for existing teacher notes.
  // We re-use the composer UI for edits via a parallel state slot so
  // both forms can never be open simultaneously (clicking "edit" closes
  // any open "+" composer, and vice versa).
  const patchFeedback = usePatchFeedback(id ?? '');
  const deleteFeedback = useDeleteFeedback(id ?? '');
  const publishFeedback = usePublishFeedback(id ?? '');
  const [editingFeedbackId, setEditingFeedbackId] = useState<string | null>(
    null,
  );
  const [editingFeedbackText, setEditingFeedbackText] = useState('');
  // Tracks which feedback row is currently mutating so the action
  // buttons can show a spinner / disable themselves.
  const [busyFeedbackId, setBusyFeedbackId] = useState<string | null>(null);
  // Clear transient teacher-note state on submission switch so a
  // half-finished edit doesn't follow the grader to the next row.
  useEffect(() => {
    setEditingFeedbackId(null);
    setEditingFeedbackText('');
    setBusyFeedbackId(null);
  }, [id]);

  // Action ids carry a kind prefix: `ai:<hash>` for an in-memory AI
  // signal, raw `<uuid>` for a persisted feedback row. The handlers
  // dispatch on that prefix so the CodeViewer can keep a single set of
  // callbacks regardless of which kind of annotation was clicked.
  const findAiSignalByKey = (key: string): RiskSignal | undefined => {
    const signals = currentAnalysis?.report?.risk_signals ?? [];
    return signals.find((s) => aiSignalKey(s) === key);
  };

  const startEditFeedback = (annId: string, currentBody: string) => {
    setComposerLine(null);
    setComposerText('');
    setEditingFeedbackId(annId);
    setEditingFeedbackText(currentBody);
  };
  const submitEditFeedback = async () => {
    const annId = editingFeedbackId;
    const text = editingFeedbackText.trim();
    if (!annId || !text) {
      setEditingFeedbackId(null);
      setEditingFeedbackText('');
      return;
    }
    try {
      setBusyFeedbackId(annId);
      if (annId.startsWith('ai:')) {
        // Editing an AI signal — promote it to a new teacher feedback
        // (visible_to_student=false by default; the eye-icon flips it
        // later if the teacher decides to share). Then tombstone the
        // original AI signal so we don't render both.
        const key = annId.slice(3);
        const signal = findAiSignalByKey(key);
        const line = signal?.line_range?.[1] ?? 1;
        await addFeedback.mutateAsync({
          body: `[L${line}] ${text}`,
          visible_to_student: false,
        });
        dismissAiSignal(key);
      } else {
        // Existing teacher feedback — PATCH in place, preserving the
        // `[L<N>] ` prefix that carries the line anchor.
        const items = feedbacks?.data ?? [];
        const fb = items.find((f) => f.id === annId);
        const m = fb?.body.match(/^\[L\d+\]\s*/);
        const prefix = m ? m[0] : `[L1] `;
        await patchFeedback.mutateAsync({
          fb_id: annId,
          body: `${prefix}${text}`,
        });
      }
      setEditingFeedbackId(null);
      setEditingFeedbackText('');
    } catch (e) {
      setProblem(parseProblem(e));
    } finally {
      setBusyFeedbackId(null);
    }
  };
  const handleDeleteFeedback = async (annId: string) => {
    try {
      setBusyFeedbackId(annId);
      if (annId.startsWith('ai:')) {
        // AI signal lives in the analysis report (not a row we can
        // delete) — tombstone locally; if the teacher reloads we
        // restore from localStorage.
        dismissAiSignal(annId.slice(3));
      } else {
        await deleteFeedback.mutateAsync(annId);
      }
      if (editingFeedbackId === annId) {
        setEditingFeedbackId(null);
        setEditingFeedbackText('');
      }
    } catch (e) {
      setProblem(parseProblem(e));
    } finally {
      setBusyFeedbackId(null);
    }
  };
  const handleToggleFeedbackVisibility = async (
    annId: string,
    nextVisible: boolean,
  ) => {
    try {
      setBusyFeedbackId(annId);
      if (annId.startsWith('ai:')) {
        // Sharing an AI signal with the student — materialise as a
        // teacher feedback row (so the student actually sees something)
        // and tombstone the original AI card. The student never learns
        // the note's origin.
        const key = annId.slice(3);
        const signal = findAiSignalByKey(key);
        if (!signal) return;
        const line = signal.line_range?.[1] ?? 1;
        await addFeedback.mutateAsync({
          body: `[L${line}] ${signal.details}`,
          visible_to_student: nextVisible,
        });
        dismissAiSignal(key);
      } else {
        await publishFeedback.mutateAsync({
          fb_id: annId,
          publish: nextVisible,
        });
      }
    } catch (e) {
      setProblem(parseProblem(e));
    } finally {
      setBusyFeedbackId(null);
    }
  };

  const isAnalysisBusy =
    startAnalysis.isPending ||
    runPlag.isPending ||
    currentAnalysis?.status === 'queued' ||
    currentAnalysis?.status === 'running';

  const runAllAnalyses = async () => {
    setProblem(null);
    const [aiResult, plagResult] = await Promise.allSettled([
      startAnalysis.mutateAsync({
        course_id: submission?.course_id ?? undefined,
        assignment_id: submission?.assignment_id ?? undefined,
        language: submission?.language ?? undefined,
        code: content ?? undefined,
        // Forward the task context — the page already has the
        // assignment loaded; without the problem statement the LLM
        // can only guess what the code is supposed to do.
        assignment_title: assignment?.title ?? undefined,
        assignment_description: assignment?.description ?? undefined,
        // The teacher pressed the button explicitly — they want a fresh
        // run, not a cache hit that returns the same JSON in 50ms.
        force_no_cache: true,
      }),
      submission?.assignment_id
        ? runPlag.mutateAsync({})
        : Promise.resolve(null),
    ]);
    const aiOk = aiResult.status === 'fulfilled';
    const plagOk = plagResult.status === 'fulfilled';
    if (aiOk && plagOk) {
      notify.success('Анализ запущен');
    } else if (aiOk) {
      notify.success('LLM запущен; плагиат недоступен');
    } else if (plagOk) {
      notify.success('Плагиат запущен; LLM недоступен');
    } else {
      setProblem(
        parseProblem(
          (aiResult as PromiseRejectedResult).reason ??
            (plagResult as PromiseRejectedResult).reason,
        ),
      );
    }
  };

  const files = useMemo(() => filesPage?.data ?? [], [filesPage]);

  // Reset the locally-cached selected file whenever the URL submission id
  // changes — otherwise after "Следующая" we end up asking the backend
  // for the previous submission's file under the new submission id (the
  // file ids don't carry over) and the code panel stays empty.
  useEffect(() => {
    setSelectedFile(null);
  }, [id]);

  // Once the new submission's file list lands, auto-select the first one.
  // We also recover from stale selections (e.g. the previously-picked
  // file is no longer in the freshly-fetched list).
  useEffect(() => {
    if (files.length === 0) return;
    const stillThere =
      selectedFile && files.some((f) => f.id === selectedFile.id);
    if (!stillThere) {
      setSelectedFile(files[0]);
    }
  }, [files, selectedFile]);

  const { data: content, isPlaceholderData: contentIsStale } =
    useSubmissionFileContent(id, selectedFile?.id);

  useDocumentTitle(submission ? `Посылка v${submission.version}` : 'Посылка');

  const isTeacher = useMemo(() => {
    if (!user || !submission) return false;
    if (hasGlobalRole(user, ['admin'])) return true;
    if (
      submission.course_id &&
      hasCourseRole(user, submission.course_id, [
        'owner',
        'co_owner',
        'assistant',
      ])
    ) {
      return true;
    }
    // A global "assistant" is a grader too. Their JWT carries no
    // course_roles (identity doesn't enrich them yet), so the course-role
    // branch above misses — gate on the global role so the assistant gets
    // the FULL review interface (grade rail, AI-анализ, inline comments,
    // ‹/› peer nav), matching the teacher. The backend already authorises
    // assistant grade-writes via its own global-role fallback
    // (rbac._global_can_manage includes "assistant").
    return hasGlobalRole(user, ['teacher', 'assistant']);
  }, [user, submission]);

  // Pre-early-return computations.
  //
  // Everything that uses a hook (useMemo here) must be called
  // unconditionally on every render, so we compute these before the
  // "submission not yet loaded" / "submission not found" branches
  // below. Each one defensively handles `submission === undefined`
  // because that's a real state during the very first load.
  //
  // Previously these lived below the early returns, which produced
  // a "Rendered more hooks than during the previous render" crash
  // the moment the page transitioned from "loading skeleton" to
  // "real submission" (the loaded-state render adds the version
  // useMemo, the loading-state render doesn't — React notices the
  // mismatch and bails out with a 500).
  const isStaleSubmission =
    !!id && !!submission && submission.id !== id;
  const isCodeLoading =
    isStaleSubmission ||
    filesPage === undefined ||
    filesIsStale ||
    (selectedFile != null && content === undefined) ||
    contentIsStale;
  // Defensive filter — only trust history entries whose author matches
  // the submission we're rendering. Without this, a stale `history`
  // payload (cached for a previously-viewed submission, returned by a
  // misbehaving cache adapter, or simply faster to land than the new
  // submission's placeholder→real swap) can briefly inflate
  // ``latestVersionEntry`` to a different student's v4 while we're
  // actually on the new student's latest v2 — producing a phantom
  // "Актуальная: v4 →" plate that disappears a beat later. Same
  // invariant as the AI/feedback/grade gates further up.
  const versions = useMemo(() => {
    const all = history?.data ?? [];
    if (!submission) return [];
    return all.filter(
      (h) =>
        h.assignment_id === submission.assignment_id &&
        h.author_id === submission.author_id,
    );
  }, [history, submission]);
  // (otherVersions used to gate the version popover trigger; with the
  // always-rendered popover trigger we no longer need it as a
  // separate value — the popover decides its own state from
  // `versions.length` once history loads.)
  const latestVersionEntry = useMemo(
    () => versions.slice().sort((a, b) => b.version - a.version)[0] ?? null,
    [versions],
  );
  const isOutdated =
    !isStaleSubmission &&
    !!submission &&
    latestVersionEntry != null &&
    latestVersionEntry.id !== submission.id &&
    latestVersionEntry.version > submission.version;

  if (isLoading && !submission) {
    // Page-shaped skeleton — mirrors the real layout (header + code
    // panel + grade rail) instead of a generic stack of bars. Without
    // this the grader gets a confusing flash of "this looks like a
    // different page" between the breadcrumb and the real content.
    return (
      <Page width="wide" data-testid="submission-detail-loading">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <div className="h-7 w-56 rounded-md bg-muted/40 animate-pulse" />
            <div className="h-3 w-72 rounded-md bg-muted/30 animate-pulse" />
          </div>
          <div className="h-9 w-44 rounded-full bg-muted/30 animate-pulse" />
        </div>
        <div className="h-10 w-full rounded-md bg-muted/20 animate-pulse" />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div
            className="h-[480px] w-full rounded-md bg-muted animate-pulse"
            aria-label="Загрузка кода"
          />
          <aside className="space-y-6">
            <div className="space-y-3">
              <div className="h-3 w-16 rounded-md bg-muted/40 animate-pulse" />
              <div className="grid grid-cols-6 gap-1.5">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-9 rounded-md bg-muted/30 animate-pulse"
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <div className="h-3 w-24 rounded-md bg-muted/40 animate-pulse" />
              <div className="h-20 w-full rounded-md bg-muted/20 animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-16 rounded-md bg-muted/40 animate-pulse" />
              <div className="h-3 w-2/3 rounded-md bg-muted/30 animate-pulse" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-20 rounded-md bg-muted/40 animate-pulse" />
              <div className="h-3 w-3/4 rounded-md bg-muted/30 animate-pulse" />
              <div className="h-3 w-1/2 rounded-md bg-muted/30 animate-pulse" />
            </div>
          </aside>
        </div>
      </Page>
    );
  }

  if (!submission) {
    return (
      <p className="text-sm text-muted-foreground">Посылка не найдена</p>
    );
  }

  // (isStaleSubmission / isCodeLoading / versions / otherVersions /
  //  latestVersionEntry / isOutdated are all computed *above* the
  //  early returns so the hook count stays stable across the loading-
  //  to-loaded transition — see comment near the isTeacher useMemo.)

  return (
    <Page width="wide" data-testid="submission-detail">
      <div
        data-submission-id={submission.id}
        className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"
      >
        <div>
          {isStaleSubmission ? (
            // While we wait for the freshly-navigated submission to load,
            // show a skeleton header so the grader doesn't think the
            // previous row's name belongs to the new submission.
            <>
              <div className="h-7 w-48 rounded-md bg-muted/40 animate-pulse" />
              <div className="mt-3 h-3 w-72 rounded-md bg-muted/30 animate-pulse" />
            </>
          ) : (
            <>
          {/* Name + plagiarism pill on the SAME row. The pill goes
              here (rather than in the meta line below) so its border
              doesn't disappear into the muted `·`-separated sequence,
              and rather than on its own row so we don't grow the
              header vertically. Outlined StatusPill per design-system. */}
          <div className="flex flex-wrap items-center gap-3">
            <h1
              data-testid="submission-author"
              className="text-2xl font-semibold tracking-tight leading-tight"
            >
              {displayAuthor(submission)}
            </h1>
            {submission.assignment_id && (() => {
              // Five visible states; pill always opens the same modal
              // regardless of state — the modal decides what to show
              // (map / spinner / "запустить" CTA / error + retry). No
              // navigation: the grader never leaves this submission.
              type PlagState =
                | 'unchecked'
                | 'pending'
                | 'failed'
                | 'clean'
                | 'matches';
              const state: PlagState = !latestRun
                ? 'unchecked'
                : latestRun.status === 'queued' ||
                    latestRun.status === 'running'
                  ? 'pending'
                  : latestRun.status === 'failed' ||
                      latestRun.status === 'cancelled'
                    ? 'failed'
                    : pairsForSubmission.length > 0
                      ? 'matches'
                      : 'clean';
              const TONE = {
                unchecked: 'neutral' as const,
                pending: 'info' as const,
                failed: 'warning' as const,
                clean: 'success' as const,
                matches: 'destructive' as const,
              };
              const LABEL = {
                unchecked: 'Плагиат не проверялся',
                pending: 'Плагиат: проверяется…',
                failed: 'Плагиат: ошибка проверки',
                clean: 'Плагиат: чисто',
                matches: `Плагиат: ${pairsForSubmission.length}`,
              };
              return (
                <button
                  type="button"
                  onClick={() => setPlagMapOpen(true)}
                  className="hover:opacity-80 transition-opacity"
                  data-testid="submission-plagiarism-chip"
                  data-plagiarism-state={state}
                >
                  <StatusPill tone={TONE[state]}>{LABEL[state]}</StatusPill>
                </button>
              );
            })()}
          </div>
          {/* Slim meta line — only the three things a grader actually
              reads at the top: a link back to the source, when it was
              submitted, and the version-history popover. Plagiarism,
              language, late/suspicious chips have all moved out (see
              below: language sits over the code block; late/suspicious
              still surface but as plain text, not pills; plagiarism is
              shown next to the code title). */}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            {submission.external_url ? (
              <a
                href={submission.external_url}
                target="_blank"
                rel="noopener"
                className="underline-offset-2 hover:text-foreground hover:underline"
                data-testid="submission-external-link"
              >
                Открыть в Yandex.Contest ↗
              </a>
            ) : (
              <span data-testid="submission-id" className="font-mono text-xs">
                {submission.id}
              </span>
            )}
            <span>·</span>
            <span>{formatDateTime(submission.submitted_at)}</span>
            {submission.is_late && (
              <>
                <span>·</span>
                <span
                  data-testid="submission-late-badge"
                  data-late-kind={submission.late_kind ?? ''}
                  className={
                    submission.late_kind === 'hard'
                      ? 'text-destructive'
                      : 'text-amber-500'
                  }
                >
                  {submission.late_kind === 'hard' ? 'late hard' : 'late'}
                </span>
              </>
            )}
            {submission.flags.suspicious && (
              <>
                <span>·</span>
                <span
                  data-testid="submission-suspicious-badge"
                  className="text-destructive"
                >
                  подозрит.
                </span>
              </>
            )}
            {isOutdated && latestVersionEntry && (
              <>
                <span>·</span>
                <Link
                  to={`/submissions/${latestVersionEntry.id}`}
                  className="text-foreground underline-offset-2 hover:underline"
                  data-testid="submission-latest-link"
                >
                  Актуальная: v{latestVersionEntry.version} →
                </Link>
              </>
            )}
            <span>·</span>
            {/* `v3` itself is the popover trigger when other versions
                exist. Removes the extra "· версий N" copy and gives a
                hint that the version chip is interactive. Plain text when
                this is the only submission. */}
            {/* Version chip is always a popover trigger so the
                grader can pull up earlier attempts without paying for
                a history-fetch on the page's critical path. The
                actual `useSubmissionHistory` query is gated on
                `versionPopoverOpened` — clicking the chip the first
                time enables it, after which the list shows. */}
            <Popover
              onOpenChange={(open) => {
                if (open) setVersionPopoverOpened(true);
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  data-testid="submission-version"
                  className="font-mono hover:text-foreground"
                >
                  v{submission.version}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-2">
                {versionPopoverOpened && versions.length === 0 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Загрузка…
                  </div>
                ) : versions.length <= 1 ? (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    Других версий нет
                  </div>
                ) : (
                  <ol className="space-y-0.5">
                    {versions
                      .slice()
                      .sort((a, b) => b.version - a.version)
                      .map((h) => {
                        const current = h.id === submission.id;
                        return (
                          <li key={h.id}>
                            <Link
                              to={`/submissions/${h.id}`}
                              className={
                                'flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/60 ' +
                                (current ? 'font-medium' : '')
                              }
                            >
                              <span className="font-mono">v{h.version}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatDateTime(h.submitted_at)}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                  </ol>
                )}
              </PopoverContent>
            </Popover>
          </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isTeacher && (
            <Button
              onClick={runAllAnalyses}
              disabled={isAnalysisBusy || !submission.assignment_id}
              data-testid="submission-run-analysis"
            >
              {isAnalysisBusy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Запустить анализ
            </Button>
          )}
          {assignment && (
            <Button asChild variant="ghost">
              <Link to={`/assignments/${assignment.id}`}>← К заданию</Link>
            </Button>
          )}
        </div>
      </div>

      <ProblemAlert problem={problem} />

      {/* Universal plagiarism dialog — opens from the pill in every
          state (unchecked / pending / failed / clean / matches). The
          inner content adapts: cluster map for completed, spinner +
          status for pending, retry CTA for failed, "запустить" CTA
          for unchecked. The grader never leaves this submission. */}
      <PlagiarismMapDialog
        open={plagMapOpen}
        onOpenChange={setPlagMapOpen}
        latestRun={latestRun}
        currentSubmissionId={submission.id}
        onStart={async () => {
          try {
            await runPlag.mutateAsync({});
            notify.success('Проверка плагиата запущена');
          } catch (e) {
            setProblem(parseProblem(e));
          }
        }}
        starting={runPlag.isPending}
      />

      {/* (Plagiarism alert removed — the pill near the student's name
          already signals "Плагиат: N" in destructive tone; a second
          banner over the code was redundant noise.) */}

      {/* Collapsible statement: a quiet ▶ "Условие задачи" row that opens
          to show the rendered HTML. Default-closed so the code stays in
          focus; one click expands it when the teacher needs to recheck
          the spec. Uses the same assignment-prose typography as the
          assignment page. */}
      {assignment?.description && (
        <details className="group rounded-md border border-border/60 bg-muted/20">
          <summary
            className="flex cursor-pointer list-none items-center gap-2 px-4 py-2.5 text-sm font-medium text-foreground/80 hover:bg-muted/40"
            data-testid="submission-statement-toggle"
          >
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1">
              {assignment.title || 'Условие задачи'}
            </span>
            <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90 text-muted-foreground" />
          </summary>
          <div
            className="border-t border-border/60 p-4 text-sm leading-relaxed text-foreground/90 assignment-prose"
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(assignment.description),
            }}
          />
        </details>
      )}

      {/* Hero: code on the left, grade rail on the right (teacher only). */}
      <div
        className={
          isTeacher
            ? 'grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]'
            : ''
        }
      >
        <section data-testid="submission-section-files" className="min-w-0">
          {isCodeLoading ? (
            // Match the height of a typical code block (~480 px) so the
            // layout doesn't jump when the new submission lands.
            <div
              className="h-[480px] w-full rounded-md bg-muted animate-pulse"
              aria-label="Загрузка кода"
            />
          ) : files.length === 0 ? (
            <Empty>Файлов нет</Empty>
          ) : files.length === 1 && selectedFile ? (
            // Drop `compact` so the CodeViewer renders its own header
            // (filename · language · size) right above the code block.
            // That's where the language label belongs — next to what
            // it describes — rather than as a pill in the meta line.
            <CodeViewer
              fileName={selectedFile.path}
              code={content ?? ''}
              sizeBytes={selectedFile.size_bytes}
              language={submission.language ?? undefined}
              maxHeight="none"
              annotations={codeAnnotations}
              onAddComment={isTeacher ? (line) => {
                setComposerLine(line);
                setEditingFeedbackId(null);
                setEditingFeedbackText('');
                setComposerText('');
              } : undefined}
              composerForLine={composerLine}
              renderComposer={(line) => (
                <InlineCommentComposer
                  line={line}
                  value={composerText}
                  onChange={setComposerText}
                  onCancel={() => {
                    setComposerLine(null);
                    setComposerText('');
                  }}
                  onSubmit={submitComposer}
                  busy={addFeedback.isPending}
                />
              )}
              onEditTeacherNote={isTeacher ? startEditFeedback : undefined}
              editingFeedbackId={editingFeedbackId}
              renderTeacherEditor={(fbId) => (
                <InlineCommentComposer
                  line={0 /* hidden inside the composer */}
                  value={editingFeedbackText}
                  onChange={setEditingFeedbackText}
                  onCancel={() => {
                    setEditingFeedbackId(null);
                    setEditingFeedbackText('');
                  }}
                  onSubmit={submitEditFeedback}
                  busy={
                    patchFeedback.isPending &&
                    busyFeedbackId === fbId
                  }
                />
              )}
              onDeleteTeacherNote={
                isTeacher ? handleDeleteFeedback : undefined
              }
              onToggleTeacherNoteVisibility={
                isTeacher ? handleToggleFeedbackVisibility : undefined
              }
              teacherNoteActionsBusyFor={busyFeedbackId}
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-12">
              <Card data-testid="file-tree" className="md:col-span-4">
                <CardContent className="p-2">
                  <FileTreeViewer
                    files={files}
                    selectedFileId={selectedFile?.id ?? null}
                    onSelect={setSelectedFile}
                  />
                </CardContent>
              </Card>
              <div className="md:col-span-8">
                {selectedFile ? (
                  <CodeViewer
                    fileName={selectedFile.path}
                    code={content ?? ''}
                    sizeBytes={selectedFile.size_bytes}
                    language={submission.language ?? undefined}
                    maxHeight="none"
                    annotations={codeAnnotations}
                    onAddComment={isTeacher ? (line) => {
                      setComposerLine(line);
                      setEditingFeedbackId(null);
                      setEditingFeedbackText('');
                      setComposerText('');
                    } : undefined}
                    composerForLine={composerLine}
                    renderComposer={(line) => (
                      <InlineCommentComposer
                        line={line}
                        value={composerText}
                        onChange={setComposerText}
                        onCancel={() => {
                          setComposerLine(null);
                          setComposerText('');
                        }}
                        onSubmit={submitComposer}
                        busy={addFeedback.isPending}
                      />
                    )}
                    onEditTeacherNote={
                      isTeacher ? startEditFeedback : undefined
                    }
                    editingFeedbackId={editingFeedbackId}
                    renderTeacherEditor={(fbId) => (
                      <InlineCommentComposer
                        line={0}
                        value={editingFeedbackText}
                        onChange={setEditingFeedbackText}
                        onCancel={() => {
                          setEditingFeedbackId(null);
                          setEditingFeedbackText('');
                        }}
                        onSubmit={submitEditFeedback}
                        busy={
                          patchFeedback.isPending &&
                          busyFeedbackId === fbId
                        }
                      />
                    )}
                    onDeleteTeacherNote={
                      isTeacher ? handleDeleteFeedback : undefined
                    }
                    onToggleTeacherNoteVisibility={
                      isTeacher
                        ? handleToggleFeedbackVisibility
                        : undefined
                    }
                    teacherNoteActionsBusyFor={busyFeedbackId}
                  />
                ) : (
                  <Empty>Выберите файл слева</Empty>
                )}
              </div>
            </div>
          )}
        </section>

        {isTeacher && (
          <aside data-testid="submission-section-grade" className="space-y-6">
            {/* Display mode → big score + plain-text comment + soft
                icon buttons. Edit / new-grade mode → the form. The
                section label lives only inside the read-only view so
                the form's own "Оценка" Label doesn't repeat it. */}
            {grade && !editingGrade ? (
              <GradeDisplay
                score={grade.score}
                maxScore={assignment?.max_score ?? 10}
                comment={grade.comment ?? null}
                commentVisibleToStudent={grade.comment_visible_to_student}
                deleting={deleteGrade.isPending}
                onEdit={() => setEditingGrade(true)}
                onDelete={async () => {
                  try {
                    await deleteGrade.mutateAsync();
                    notify.success('Оценка снята');
                    setEditingGrade(false);
                  } catch (e) {
                    setProblem(parseProblem(e));
                  }
                }}
              />
            ) : (
              // `key={id}` forces a fresh GradeForm whenever the
              // submission switches. Without it, the form's useState
              // initializers run once on mount and retain values from
              // the previous student — so the auto-applied AI
              // suggestion ("Твой код реализует поиск второго
              // максимума…") would bleed across ‹/› navigation.
              <GradeForm
                key={id ?? '-'}
                initial={
                  grade
                    ? {
                        score: grade.score,
                        comment: grade.comment ?? undefined,
                        comment_visible_to_student:
                          grade.comment_visible_to_student,
                      }
                    : null
                }
                maxScore={assignment?.max_score ?? 10}
                isLateHard={submission.late_kind === 'hard'}
                loading={setGrade.isPending}
                suggestedComment={
                  !isStaleSubmission &&
                  currentAnalysis?.status === 'completed'
                    ? currentAnalysis?.report?.student_brief || undefined
                    : undefined
                }
                onSubmit={async (input) => {
                  try {
                    await setGrade.mutateAsync(input);
                    notify.success('Оценка сохранена');
                    setEditingGrade(false);
                  } catch (e) {
                    setProblem(parseProblem(e));
                  }
                }}
                onCancel={
                  grade ? () => setEditingGrade(false) : undefined
                }
              />
            )}
            {grade && (
              <Accordion
                type="single"
                collapsible
                // Defer the grade-history fetch until the accordion is
                // first opened. Skipping the request on collapse keeps
                // the page's critical-path round-trips small.
                onValueChange={(v) => {
                  if (v === 'history') setGradeHistoryOpened(true);
                }}
              >
                <AccordionItem value="history" className="border-b-0">
                  <AccordionTrigger className="text-xs uppercase tracking-wide text-muted-foreground hover:no-underline py-1">
                    История
                  </AccordionTrigger>
                  <AccordionContent>
                    {gradeHistoryError ? (
                      <Empty>История недоступна</Empty>
                    ) : !gradeHistory ? (
                      <div className="text-xs text-muted-foreground">
                        Загрузка…
                      </div>
                    ) : (gradeHistory.data ?? []).length === 0 ? (
                      <Empty>Изменений нет</Empty>
                    ) : (
                      <ol className="space-y-2 text-sm">
                        {(gradeHistory?.data ?? []).map((h) => (
                          <li
                            key={h.id}
                            data-testid={`grade-history-row-${h.id}`}
                            className="border-l-2 border-border/50 pl-3"
                          >
                            <div className="font-medium">
                              {h.score} / {assignment?.max_score ?? '—'}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {formatDateTime(h.graded_at) ?? '—'} ·{' '}
                              {h.graded_by}
                            </div>
                            {h.comment && (
                              <div className="mt-1 text-xs">{h.comment}</div>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            )}

            {/* Plagiarism status — the in-rail tile was removed: a
                "clean / not checked" row is just visual noise on the
                99 % of submissions where there's nothing to act on.
                When matches ARE found, the page surfaces them as a
                destructive Alert above the code (see further up the
                tree) — that way the grader can't miss them. */}

            {/* AI report lives under the grade rail — the same teacher who
             * is grading wants the model's take next to the score, not in a
             * separate bottom panel. */}
            <div
              data-testid="submission-section-ai"
              className="space-y-3"
            >
              <SectionLabel
                action={
                  <div className="flex items-center gap-3">
                    {/* "Идёт анализ" lives here next to the header
                        instead of as a bulky banner in the body — a
                        quiet spinner the grader notices but that
                        doesn't shove the report down. */}
                    {isAnalysisBusy && (
                      <span
                        data-testid="ai-busy-indicator"
                        className="flex items-center gap-1 text-xs font-normal normal-case text-muted-foreground"
                      >
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Идёт анализ
                      </span>
                    )}
                    {analysisList.length > 1 && (
                      <div
                        data-testid="ai-version-nav"
                        className="flex items-center gap-1 text-xs"
                      >
                        <button
                          type="button"
                          aria-label="Предыдущая версия"
                          disabled={analysisIdx >= analysisList.length - 1}
                          onClick={() =>
                            setAnalysisIdx((i) =>
                              Math.min(i + 1, analysisList.length - 1),
                            )
                          }
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </button>
                        <span className="tabular-nums text-muted-foreground">
                          {analysisList.length - analysisIdx}/
                          {analysisList.length}
                        </span>
                        <button
                          type="button"
                          aria-label="Следующая версия"
                          disabled={analysisIdx <= 0}
                          onClick={() =>
                            setAnalysisIdx((i) => Math.max(i - 1, 0))
                          }
                          className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                }
              >
                AI-анализ
              </SectionLabel>
              {isStaleSubmission ? (
                // Skeleton while the new submission's analyses load.
                // Without this gate the section briefly shows the
                // previous student's report (the queries that drive
                // currentAnalysis haven't yet flipped to the new id's
                // pending state).
                <div className="space-y-2" aria-label="Загрузка AI-анализа">
                  <div className="h-3 w-2/3 rounded-md bg-muted/40 animate-pulse" />
                  <div className="h-3 w-1/2 rounded-md bg-muted/30 animate-pulse" />
                  <div className="h-3 w-3/4 rounded-md bg-muted/30 animate-pulse" />
                </div>
              ) : (
                <AISummary
                  analysis={currentAnalysis}
                  pending={isAnalysisBusy}
                />
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Review-flow nav (bottom). Big buttons so the grader can chain
          through посылки without hunting for tiny icons after every
          grade. Hidden for non-staff or when there's only one peer. */}
      {isTeacher && peerIds.length > 1 && (
        <div
          className="mt-8 flex items-center justify-between gap-3 border-t border-border/60 pt-6"
          data-testid="submission-peer-nav"
        >
          <Button
            variant="outline"
            size="lg"
            disabled={!prevPeerId}
            onClick={() =>
              prevPeerId && navigate(`/submissions/${prevPeerId}`)
            }
            data-testid="submission-peer-prev"
            className="min-w-[180px] justify-start"
          >
            <ChevronLeft className="mr-2 h-5 w-5" />
            Предыдущая
          </Button>
          <span
            className="text-sm tabular-nums text-muted-foreground"
            aria-label="Позиция текущей посылки"
          >
            {peerIndex >= 0 ? `${peerIndex + 1} из ${peerIds.length}` : null}
          </span>
          <Button
            size="lg"
            disabled={!nextPeerId}
            onClick={() =>
              nextPeerId && navigate(`/submissions/${nextPeerId}`)
            }
            data-testid="submission-peer-next"
            className="min-w-[180px] justify-end"
          >
            Следующая
            <ChevronRight className="ml-2 h-5 w-5" />
          </Button>
        </div>
      )}
    </Page>
  );
}

/** Section header: uppercase muted label + optional count + optional inline
 * action. Lightweight, no H2 visual weight. */
function SectionLabel({
  children,
  count,
  action,
}: {
  children: React.ReactNode;
  count?: number;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/50 pb-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {children}
        {typeof count === 'number' && count > 0 && (
          <span className="ml-1.5 normal-case text-muted-foreground/70">
            {count}
          </span>
        )}
      </span>
      {action}
    </div>
  );
}

/** Inline empty state — one muted line + optional small link. */
function Empty({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 py-2 text-sm text-muted-foreground">
      <span>{children}</span>
      {action}
    </div>
  );
}

const AI_STATUS_LABEL: Record<AIAnalysis['status'], string> = {
  queued: 'В очереди',
  running: 'Выполняется…',
  completed: 'Готов',
  failed: 'Ошибка',
  cancelled: 'Отменён',
};

/** Compact AI summary — replaces the full SubmissionAIReportView on the
 * detail page since signal cards now render inline in the code. Shows
 * status + summary + count of inline signals + non-anchored signals as a
 * short list + questions / recommendations.
 *
 * `pending` makes the section show an "Идёт анализ…" banner even before
 * the backend creates the analysis row — the mutation has just been fired
 * but the latest analysis still points at the previous (failed) record. */
function AISummary({
  analysis,
  pending,
}: {
  analysis: AIAnalysis | null;
  pending?: boolean;
}) {
  const showBusy =
    pending ||
    analysis?.status === 'queued' ||
    analysis?.status === 'running';

  // Compact skeleton — shown whenever we're waiting with nothing
  // completed to display yet. The "Идёт анализ" label itself now lives
  // next to the section header (SectionLabel action), so the body just
  // needs to hint "content loading", not repeat the banner.
  const loadingSkeleton = (
    <div className="space-y-2" aria-label="Идёт анализ" data-testid="ai-summary-busy">
      <div className="h-3 w-2/3 rounded-md bg-muted/40 animate-pulse" />
      <div className="h-3 w-1/2 rounded-md bg-muted/30 animate-pulse" />
      <div className="h-3 w-3/4 rounded-md bg-muted/30 animate-pulse" />
    </div>
  );

  if (!analysis) {
    return showBusy ? loadingSkeleton : <Empty>Не запускался</Empty>;
  }
  if (analysis.status !== 'completed' || !analysis.report) {
    if (showBusy) return loadingSkeleton;
    return (
      <Empty>
        {AI_STATUS_LABEL[analysis.status] ?? analysis.status}
        {analysis.failure_reason && (
          <span className="block text-xs">{analysis.failure_reason}</span>
        )}
      </Empty>
    );
  }
  const { summary, risk_signals, questions, recommendations } =
    analysis.report;
  // Line-anchored signals already render inline next to the code — they
  // don't belong in this panel (and the old "N замеч. привязано к строкам
  // кода ↑" pointer was just noise). Only the non-anchored ones, which
  // have nowhere else to live, surface here.
  const globalSignals = risk_signals.filter(
    (s) => !Array.isArray(s.line_range) || s.line_range.length !== 2,
  );
  return (
    <div className="space-y-3 text-sm">
      {/* Short reviewer-facing résumé — a verdict, not a re-listing of
          the inline line comments. */}
      {summary && (
        <p className="whitespace-pre-wrap text-foreground/90">{summary}</p>
      )}
      {globalSignals.length > 0 && (
        <ul className="space-y-1">
          {globalSignals.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span
                className={
                  'mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full ' +
                  (s.severity === 'high'
                    ? 'bg-red-500'
                    : s.severity === 'medium'
                      ? 'bg-amber-500'
                      : 'bg-sky-500')
                }
              />
              <span>{s.details}</span>
            </li>
          ))}
        </ul>
      )}
      {/* Questions + recommendations are collapsed by default — useful
          on demand, but they shouldn't push the summary out of view on
          first glance. Native <details>, no JS state needed. */}
      {questions.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground">
            <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
            Вопросы
            <span className="tabular-nums">({questions.length})</span>
          </summary>
          <ol className="mt-1.5 list-decimal list-inside space-y-1 text-xs">
            {questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ol>
        </details>
      )}
      {recommendations.length > 0 && (
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground">
            <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
            Рекомендации
            <span className="tabular-nums">({recommendations.length})</span>
          </summary>
          <ul className="mt-1.5 list-disc list-inside space-y-1 text-xs">
            {recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Inline composer rendered under a code line when the grader clicks the
 *  "+" affordance. Saves through the feedback API with a "[L<N>] " prefix
 *  so we can reconstruct the line anchor on the next load.
 *
 *  Compact GitHub-style box: ~max 520px wide, 2 rows of text + an inline
 *  action row. The "Строка N" header is omitted — the composer's position
 *  in the gutter already makes the anchor obvious.
 *
 *  Ctrl/Cmd-Enter saves, Esc cancels. Keeps the grader's hands on the
 *  keyboard for fast review passes. */
function PlagiarismMapDialog({
  open,
  onOpenChange,
  latestRun,
  currentSubmissionId,
  onStart,
  starting,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  latestRun: PlagiarismRun | null;
  currentSubmissionId: string;
  onStart: () => void;
  starting: boolean;
}) {
  const runId = latestRun?.id ?? null;
  const status = latestRun?.status;
  const isCompleted = status === 'completed';
  // Only fetch pairs/clusters when modal is open AND run is completed.
  // For queued/running/failed we skip the request entirely; pending UI
  // doesn't need pair data.
  const enabled = open && !!runId && isCompleted;
  const pairsQ = usePairs(
    runId ?? '',
    { limit: 200, sort: '-similarity' },
    { enabled },
  );
  const clustersQ = useClusters(runId ?? '', { enabled });
  const pairs = pairsQ.data?.data ?? [];
  const clusters = clustersQ.data?.data ?? [];

  // In-modal view: "map" (cluster graph) ↔ "diff" (side-by-side code
  // of one pair). Clicking an edge switches to diff; ← back returns
  // to map. Reset to map whenever the dialog closes so reopening
  // always lands on the overview.
  const [selectedPairId, setSelectedPairId] = useState<string | null>(null);
  useEffect(() => {
    if (!open) setSelectedPairId(null);
  }, [open]);

  // Pick the body for each state. Header + close are shared.
  let body: React.ReactNode;
  if (!latestRun) {
    // unchecked — no run has ever been queued for this assignment
    body = (
      <div className="py-8 text-center space-y-4">
        <p className="text-sm text-muted-foreground">
          Эту посылку ещё не проверяли на плагиат. Запустить проверку?
        </p>
        <Button onClick={onStart} disabled={starting}>
          {starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Запустить проверку
        </Button>
      </div>
    );
  } else if (status === 'queued' || status === 'running') {
    // pending — derive a human stage from what fields are populated.
    // Three milestones the user actually cares about:
    //   1. в очереди — scheduler hasn't picked the row yet
    //   2. загрузка посылок — `running` but no submissions_count yet
    //   3. JPlag сравнивает N посылок — submission set materialised
    const sc = latestRun.submissions_count ?? 0;
    const startedAt = latestRun.started_at
      ? new Date(latestRun.started_at)
      : null;
    const elapsedS = startedAt
      ? Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 1000))
      : null;
    type Stage = {
      label: string;
      hint: string;
      active: boolean;
      done: boolean;
    };
    const stages: Stage[] = [
      {
        label: 'В очереди',
        hint: 'Scheduler подхватывает run',
        active: status === 'queued',
        done: status === 'running',
      },
      {
        label: 'Подготовка',
        hint: 'Качаем файлы посылок из submission-service',
        active: status === 'running' && sc === 0,
        done: status === 'running' && sc > 0,
      },
      {
        label: `JPlag сравнивает посылки${sc > 0 ? ` (${sc})` : ''}`,
        hint:
          elapsedS != null
            ? `Идёт ${elapsedS} с — обычно 10-30 с`
            : 'Сравнивает пары студенческого кода',
        active: status === 'running' && sc > 0,
        done: false,
      },
    ];
    body = (
      <div className="py-6 space-y-4">
        <ol className="space-y-3">
          {stages.map((s, i) => (
            <li
              key={i}
              className="flex items-start gap-3"
              data-stage-active={s.active ? 'true' : 'false'}
              data-stage-done={s.done ? 'true' : 'false'}
            >
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                {s.done ? (
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                ) : s.active ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/30" />
                )}
              </span>
              <span className="flex-1">
                <span
                  className={cn(
                    'text-sm',
                    s.done
                      ? 'text-muted-foreground line-through'
                      : s.active
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground',
                  )}
                >
                  {s.label}
                </span>
                <span className="block text-xs text-muted-foreground/70">
                  {s.hint}
                </span>
              </span>
            </li>
          ))}
        </ol>
        <div className="text-xs text-muted-foreground/60 font-mono pt-2 border-t border-border/40">
          run · {latestRun.id}
        </div>
      </div>
    );
  } else if (status === 'failed' || status === 'cancelled') {
    // failed — show error + retry. ``error`` shape comes from backend
    // problem json; we read the title/detail defensively.
    const err = (latestRun.error ?? null) as
      | { title?: string; detail?: string }
      | null;
    body = (
      <div className="py-6 space-y-4">
        <div className="text-sm text-destructive font-medium">
          {err?.title ?? 'Ошибка проверки'}
        </div>
        {err?.detail && (
          <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono bg-muted/40 rounded-md p-3 max-h-40 overflow-y-auto">
            {err.detail}
          </pre>
        )}
        <div className="text-center">
          <Button onClick={onStart} disabled={starting}>
            {starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Перезапустить проверку
          </Button>
        </div>
      </div>
    );
  } else if (pairsQ.isLoading || clustersQ.isLoading) {
    body = (
      <div className="py-10 text-center text-sm text-muted-foreground">
        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
        Загрузка карты…
      </div>
    );
  } else if (pairs.length === 0) {
    // clean — completed run but no pairs above threshold
    body = (
      <div className="py-8 text-center space-y-4">
        <p className="text-sm text-muted-foreground">
          JPlag не нашёл совпадений выше порога. Сеть студентов рисовать
          нечего.
        </p>
        <Button
          variant="outline"
          onClick={onStart}
          disabled={starting}
          size="sm"
        >
          {starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Перепроверить
        </Button>
      </div>
    );
  } else if (selectedPairId) {
    // Diff view: side-by-side code panes for one pair. Header switches
    // to a back button that returns to the map.
    body = (
      <PairDiffInline runId={runId!} pairId={selectedPairId} />
    );
  } else {
    // matches — show the map, highlighting (and centring on) the
    // current submission so the grader immediately spots themselves
    // in the network. Edge click → swap into diff view in-place.
    body = (
      <>
        <ClusterMapView
          pairs={pairs}
          clusters={clusters}
          runId={runId!}
          focusSubmissionId={currentSubmissionId}
          onPairClick={(id) => setSelectedPairId(id)}
          totalSubmissions={latestRun.submissions_count}
        />
        <div className="mt-2 text-right">
          <Link
            to={`/plagiarism-runs/${runId}`}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Открыть полный отчёт →
          </Link>
        </div>
      </>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Content-sized vertical, capped at 92vh: short diffs (most
        // are <100 LOC) get a compact modal centred on screen; the
        // cluster-map view fills the cap because its SVG asks for
        // 100% height through ``preserveAspectRatio=meet``. Width
        // stays generous so panes / labels read clearly.
        className="w-[92vw] sm:max-w-[1400px] max-h-[92vh] flex flex-col p-0 gap-0"
        data-testid="submission-plagiarism-map-dialog"
      >
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
          <DialogTitle className="text-base font-semibold">
            {selectedPairId ? (
              // Short label — ChevronLeft already reads as "back".
              // The diff view is obviously a comparison; the title
                // doesn't need to spell it out.
              <button
                type="button"
                onClick={() => setSelectedPairId(null)}
                className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
                К карте
              </button>
            ) : (
              'Плагиат'
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0 overflow-hidden px-6 pb-6">
          {body}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InlineCommentComposer({
  value,
  onChange,
  onCancel,
  onSubmit,
  busy,
}: {
  line: number;
  value: string;
  onChange: (v: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
  busy: boolean;
}) {
  return (
    <div className="max-w-[520px] space-y-1.5">
      <textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          } else if (
            e.key === 'Enter' &&
            (e.metaKey || e.ctrlKey) &&
            !busy &&
            value.trim()
          ) {
            e.preventDefault();
            onSubmit();
          }
        }}
        placeholder="Комментарий…"
        rows={2}
        className="block w-full rounded-md border border-border/60 bg-background/80 px-2 py-1.5 text-sm leading-relaxed focus:border-foreground/30 focus:outline-none"
      />
      <div className="flex items-center justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          disabled={busy}
          className="h-7 px-2 text-xs"
        >
          Отмена
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onSubmit}
          disabled={busy || !value.trim()}
          className="h-7 px-2.5 text-xs"
        >
          {busy ? (
            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
          ) : null}
          Сохранить
        </Button>
      </div>
    </div>
  );
}
