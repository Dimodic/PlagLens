/**
 * Shared helpers for "what's the student's standing on this assignment?".
 *
 * Two surfaces need the same answer:
 *   • /me — the student dashboard's course tree shows the score / verdict /
 *     «на проверке» on the right of every task row.
 *   • /courses/:slug — when viewing a course as a student we now link each
 *     task to the same target the dashboard uses (latest OK submission if
 *     any, otherwise the assignment page).
 *
 * Kept here (not next to MyDashboardPage) so importing it from inside
 * CourseDetailPage doesn't create a back-link into the dashboard module.
 */

/** Lower-cased "OK" alias set used by Y.Contest / eJudge / our own runners. */
export function isAccepted(v: string | null | undefined): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === 'ok' || s === 'accepted';
}

/** Minimal subset of /users/me/submissions a status row needs. The full
 *  Submission DTO has plagiarism + author bits the student doesn't see. */
export interface MySub {
  id: string;
  assignment_id: string;
  course_id?: string;
  submitted_at: string;
  external_verdict?: string | null;
  score?: number | null;
  max_score?: number | null;
}

export interface TaskStatus {
  /** Tone the right-hand label uses. */
  tone: 'graded' | 'pending' | 'failed' | 'none';
  /** Visible text right of the title. */
  label: string;
  /** Optional submission id to jump to. */
  submissionId: string | null;
}

/** Aggregate the student's attempts on a single assignment into one
 *  status. Latest-OK with a released grade wins; otherwise the most
 *  recent OK (without a score) reads «на проверке»; otherwise the
 *  newest failed verdict surfaces. No attempts at all → empty. */
export function statusForAssignment(subs: MySub[]): TaskStatus {
  if (subs.length === 0) {
    return { tone: 'none', label: '', submissionId: null };
  }
  const sorted = subs
    .slice()
    .sort(
      (a, b) =>
        new Date(b.submitted_at).getTime() -
        new Date(a.submitted_at).getTime(),
    );
  const oks = sorted.filter((s) => isAccepted(s.external_verdict));
  if (oks.length > 0) {
    const okGraded = oks.find((s) => s.score != null);
    if (okGraded) {
      const max = okGraded.max_score;
      return {
        tone: 'graded',
        label:
          max != null
            ? `${Number(okGraded.score).toFixed(1)} / ${max}`
            : Number(okGraded.score).toFixed(1),
        submissionId: okGraded.id,
      };
    }
    return {
      tone: 'pending',
      label: 'на проверке',
      submissionId: oks[0].id,
    };
  }
  const last = sorted[0];
  return {
    tone: 'failed',
    label: last.external_verdict ?? '',
    submissionId: last.id,
  };
}

/** Where a click on this task row should land — the student's latest
 *  readable submission when one exists, otherwise the assignment page
 *  (condition / upload / "Мои посылки" tab). */
export function taskLinkTarget(
  assignmentId: string | number,
  status: TaskStatus,
): string {
  return status.submissionId
    ? `/me/submissions/${status.submissionId}`
    : `/assignments/${assignmentId}`;
}
