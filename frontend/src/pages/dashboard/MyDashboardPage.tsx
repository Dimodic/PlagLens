/**
 * MyDashboardPage — student/teacher self-overview at /me.
 *
 * Layout:
 *   greeting H1
 *   StatsPanel (4 KPIs in one horizontal divider-separated strip)
 *   Section: Active assignments
 *   Section: Recent grades
 *   Section: Inbox preview
 *   Section: Recent activity (teacher / power user only)
 *
 * Test contract: keeps `my-dashboard-kpis` and `my-courses-table` testids
 * that dashboards-rbac.spec.ts asserts on.
 */
import dayjs from 'dayjs';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  CalendarClock,
  ChevronRight,
  GraduationCap,
  ListChecks,
} from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import {
  useMyDashboard,
  useMyRecentActivity,
} from '@/hooks/api/useDashboards';
import { useMyAssignments } from '@/hooks/api/useAssignments';
import { useNotifications as useNotificationFeed } from '@/hooks/api/useNotificationsApi';
import type { NotificationItem } from '@/api/endpoints/notifications';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Page } from '@/components/layout/Page';
import { StatsPanel } from '@/components/common/StatsPanel';

function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

type DueTone = 'high' | 'mid' | 'low' | 'muted';

function dueLabel(dueAt: string | null | undefined): {
  text: string;
  tone: DueTone;
} {
  if (!dueAt) return { text: 'без дедлайна', tone: 'muted' };
  const minutes = Math.round(
    (new Date(dueAt).getTime() - Date.now()) / 60_000,
  );
  if (minutes < 0) {
    const days = Math.round(Math.abs(minutes) / 1440);
    if (days >= 1) return { text: `просрочено на ${days} д.`, tone: 'high' };
    return {
      text: `просрочено на ${Math.round(Math.abs(minutes) / 60)} ч.`,
      tone: 'high',
    };
  }
  if (minutes < 1440) {
    return {
      text: `до ${Math.max(1, Math.round(minutes / 60))} ч.`,
      tone: 'mid',
    };
  }
  const days = Math.round(minutes / 1440);
  return {
    text: `до ${days} д.`,
    tone: days <= 2 ? 'mid' : 'low',
  };
}

const toneText: Record<DueTone, string> = {
  high: 'text-sev-high',
  mid: 'text-sev-mid',
  low: 'text-muted-foreground',
  muted: 'text-muted-foreground',
};
const toneDot: Record<DueTone, string> = {
  high: 'bg-sev-high',
  mid: 'bg-sev-mid',
  low: 'bg-sev-low',
  muted: 'bg-muted-foreground',
};

function initials(name?: string | null): string {
  if (!name) return 'PL';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

function relTime(iso: string): string {
  return dayjs(iso).fromNow();
}

export default function MyDashboardPage() {
  useDocumentTitle('Мой обзор');
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: dashboard, isLoading: dashLoading } = useMyDashboard();
  const { data: assignmentsData } = useMyAssignments();
  const { data: notifData } = useNotificationFeed({ limit: 3, unread: true });
  const { data: activity } = useMyRecentActivity();

  const myAssignments = assignmentsData?.data ?? [];
  // Archive-only lifecycle: anything that isn't archived is considered active.
  const activeAssignments = myAssignments.filter(
    (a) => a.status !== 'archived',
  );
  const recentGrades = dashboard?.recent_grades ?? [];
  const inbox: NotificationItem[] = notifData?.data ?? [];

  const helloLine = `${greeting()}, ${user?.display_name ?? 'друг'}`;

  return (
    <Page width="regular">
      <h1 className="text-[2rem] font-bold tracking-tight leading-tight">
        {helloLine}
      </h1>

      {/* KPI strip — single horizontal panel with vertical rules */}
      <StatsPanel
        data-testid="my-dashboard-kpis"
        items={[
          {
            icon: <ListChecks className="size-4" />,
            label: 'Активных заданий',
            value: activeAssignments.length,
          },
          {
            icon: <CalendarClock className="size-4" />,
            label: 'Скоро дедлайны',
            value: dashboard?.upcoming_deadlines?.length ?? 0,
          },
          {
            icon: <GraduationCap className="size-4" />,
            label: 'Свежих оценок',
            value: recentGrades.length,
          },
          {
            icon: <Bell className="size-4" />,
            label: 'Уведомления',
            value: inbox.length,
          },
        ]}
      />

      {/* Active assignments */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-bold">Активные задания</h2>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => navigate('/me/assignments')}
          >
            Все
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        {activeAssignments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 bg-card p-8 text-center text-sm text-muted-foreground">
            {dashLoading ? 'Загружаем…' : 'Активных заданий нет.'}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            {activeAssignments.slice(0, 5).map((a, idx) => {
              const due = dueLabel(a.due_at);
              return (
                <Link
                  key={a.id}
                  to={`/me/assignments/${a.id}`}
                  data-testid={`my-assignment-row-${a.id}`}
                  className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40 ${
                    idx > 0 ? 'border-t border-border/50' : ''
                  }`}
                >
                  <span
                    className={`h-2 w-2 flex-none rounded-full ${toneDot[due.tone]}`}
                  />
                  <div className="min-w-0 flex-1">
                    {/* No slug/id eyebrow — slugs are internal now and a
                        raw id is noise; the title carries the row. */}
                    <div className="truncate text-sm font-medium">
                      {a.title}
                    </div>
                  </div>
                  <span
                    className={`whitespace-nowrap text-sm font-medium ${toneText[due.tone]}`}
                  >
                    {due.text}
                  </span>
                  <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Recently graded */}
      <section className="space-y-3">
        <h2 className="text-xl font-bold">Свежие оценки</h2>
        {recentGrades.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 bg-card p-8 text-center text-sm text-muted-foreground">
            Пока нет оценок.
          </div>
        ) : (
          <div
            className="overflow-hidden rounded-lg border bg-card"
            data-testid="my-courses-table"
          >
            {recentGrades.slice(0, 5).map((g, idx) => (
              <Link
                key={g.submission_id}
                to={`/me/submissions/${g.submission_id}`}
                data-testid={`grade-${g.submission_id}`}
                className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40 ${
                  idx > 0 ? 'border-t border-border/50' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {g.assignment_title}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {g.course_slug} · {dayjs(g.graded_at).format('DD.MM HH:mm')}
                  </div>
                </div>
                <span className="font-mono text-sm font-semibold tabular-nums">
                  {g.score.toFixed(1)}
                </span>
                <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Inbox preview */}
      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <h2 className="text-xl font-bold">Входящие</h2>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => navigate('/notifications')}
          >
            Все
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        {inbox.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/70 bg-card p-8 text-center text-sm text-muted-foreground">
            Новых уведомлений нет.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border bg-card">
            {inbox.map((n, idx) => (
              <Link
                key={n.id}
                to={n.action_url ?? '/notifications'}
                className={`flex items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/40 ${
                  idx > 0 ? 'border-t border-border/50' : ''
                }`}
              >
                <span className="h-2 w-2 flex-none rounded-full bg-primary" />
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-accent text-xs text-accent-foreground">
                    {initials(n.source ?? 'PlagLens')}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{n.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {n.source ?? 'PlagLens'} · {relTime(n.created_at)}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 flex-none text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Recent activity (teacher / power user) */}
      {activity && activity.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <h2 className="text-xl font-bold">Недавние действия</h2>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => navigate('/activity')}
            >
              Журнал
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="overflow-hidden rounded-lg border bg-card">
            {activity.slice(0, 4).map((e, idx) => (
              <div
                key={e.id}
                className={`flex items-center gap-4 px-5 py-3 text-sm ${
                  idx > 0 ? 'border-t border-border/50' : ''
                }`}
              >
                <span className="flex-1 text-foreground/80">{e.summary}</span>
                <span className="text-xs text-muted-foreground">
                  {relTime(e.occurred_at)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </Page>
  );
}
