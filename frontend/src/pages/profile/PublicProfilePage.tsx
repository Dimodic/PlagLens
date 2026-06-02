/**
 * /u/:id — public profile (cross-tenant directory card).
 *
 * Everyone can open it: shows name, avatar, role, org (ВУЗ/tenant) and all
 * the person's courses. The submissions section only appears when the
 * viewer is allowed to see them (self / admin / a teacher who shares a
 * course) — the gateway gates that server-side, so an empty list simply
 * renders nothing.
 */
import { useParams, Link } from 'react-router-dom';
import { BookOpen, FileCode2, Loader2, ShieldAlert } from 'lucide-react';
import dayjs from 'dayjs';
import { Page } from '@/components/layout/Page';
import { cn } from '@/components/ui/utils';
import { RoleBadge } from '@/components/common/RoleBadge';
import { useProfile } from '@/hooks/api/useSearch';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import type { ProfileSubmissionRef } from '@/api/endpoints/search';


function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
}

function verdictTone(v?: string | null): string {
  if (!v) return 'text-muted-foreground';
  const up = v.toUpperCase();
  if (up === 'OK' || up === 'AC') return 'text-sev-low';
  return 'text-sev-mid';
}

function SubmissionRow({ s }: { s: ProfileSubmissionRef }) {
  const { t } = useTranslation();
  const title = s.assignment_title || s.homework_title || t('public_profile.submission_fallback_title');
  return (
    <Link
      to={`/submissions/${s.id}`}
      className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-accent"
    >
      <FileCode2 className="h-4 w-4 flex-none text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        <div className="truncate text-xs text-muted-foreground">
          {[s.course_name, s.submitted_at && dayjs(s.submitted_at).format('D MMM HH:mm')]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </div>
      {s.external_verdict && (
        <span className={cn('flex-none text-xs font-medium', verdictTone(s.external_verdict))}>
          {s.external_verdict}
        </span>
      )}
      {s.is_graded && s.score != null && (
        <span className="flex-none text-xs tabular-nums text-foreground">
          {s.score}
          {s.max_score != null ? `/${s.max_score}` : ''}
        </span>
      )}
    </Link>
  );
}

export default function PublicProfilePage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useProfile(id);
  useDocumentTitle(data?.card.display_name || t('public_profile.document_title'));

  if (isLoading) {
    return (
      <Page width="regular">
        <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('public_profile.loading')}
        </div>
      </Page>
    );
  }
  if (isError || !data) {
    return (
      <Page width="regular">
        <div className="flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground">
          <ShieldAlert className="h-6 w-6" />
          {t('public_profile.not_found')}
        </div>
      </Page>
    );
  }

  const { card, courses, submissions } = data;

  return (
    <Page width="regular">
      {/* Header card */}
      <div className="flex items-center gap-4">
        {card.avatar_url ? (
          <img
            src={card.avatar_url}
            alt=""
            className="h-16 w-16 flex-none rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 flex-none items-center justify-center rounded-full bg-muted text-lg font-medium uppercase text-muted-foreground">
            {initials(card.display_name) || '?'}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold">{card.display_name}</h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <RoleBadge role={card.global_role} />
            {card.tenant_name && (
              <>
                <span>·</span>
                <span>{card.tenant_name}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Courses */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t('public_profile.courses_heading')}</h2>
        {courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('public_profile.no_courses')}</p>
        ) : (
          <div className="flex flex-col divide-y divide-border/60">
            {courses.map((c) => (
              <Link
                key={c.id}
                to={`/courses/${c.slug || c.id}`}
                className="flex items-center gap-3 px-1 py-2.5 hover:bg-accent/50"
              >
                <BookOpen className="h-4 w-4 flex-none text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                <RoleBadge role={c.role} className="flex-none" />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Submissions (only when the viewer is allowed to see them) */}
      {submissions.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">
            {t('public_profile.submissions_heading')}{' '}
            <span className="text-sm font-normal text-muted-foreground">
              {t('public_profile.submissions_in_your_courses')}
            </span>
          </h2>
          <div className="flex flex-col">
            {submissions.map((s) => (
              <SubmissionRow key={s.id} s={s} />
            ))}
          </div>
        </section>
      )}
    </Page>
  );
}
