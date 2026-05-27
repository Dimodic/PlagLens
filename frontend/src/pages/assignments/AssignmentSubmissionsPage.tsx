/**
 * AssignmentSubmissionsPage — list of latest-per-student submissions for the
 * assignment with filters.
 *
 * Default (and only) view is one row per student showing their latest
 * attempt. Earlier versions of the same student's submission are reached
 * from the version popover on the submission detail page — duplicating
 * them here just makes the teacher do N× work for the same person.
 *
 * Filters are applied client-side over the latest-per-student response
 * since the backend's ``latest-per-student`` endpoint doesn't accept
 * filter params. Datasets are small enough (≤ a few hundred students
 * per assignment) for this to be a no-op perf-wise.
 */
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useAssignment } from '@/hooks/api/useAssignments';
import { useLatestPerStudent } from '@/hooks/api/useSubmissions';
import { SubmissionsTable } from '@/components/submissions/SubmissionsTable';
import { displayAuthor } from '@/api/endpoints/submissions';
import type {
  SubmissionBrief,
  SubmissionStatus,
} from '@/api/endpoints/submissions';
import { useDebounce } from '@/hooks/useDebounce';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

const ALL = '__all__';

const STATUS_OPTIONS = [
  { value: 'received', label: 'Получено' },
  { value: 'processing', label: 'Обработка' },
  { value: 'ready', label: 'Готово' },
  { value: 'error', label: 'Ошибка' },
];

const LANGUAGE_OPTIONS = [
  { value: 'python', label: 'Python' },
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
];

type StatusValue = SubmissionStatus | undefined;

export default function AssignmentSubmissionsPage() {
  useDocumentTitle('Посылки задания');
  const { id } = useParams<{ id: string }>();
  const { data: assignment } = useAssignment(id);

  const [status, setStatus] = useState<StatusValue>(undefined);
  const [language, setLanguage] = useState<string | undefined>(undefined);
  const [onlyLate, setOnlyLate] = useState(false);
  const [onlySuspicious, setOnlySuspicious] = useState(false);
  const [author, setAuthor] = useState('');
  const debouncedAuthor = useDebounce(author, 300);

  const { data, isLoading } = useLatestPerStudent(id);

  // Filters apply client-side — the latest-per-student endpoint returns
  // everything in one shot and accepts no params. Author search matches
  // both the resolved display name and the raw author_id (graders often
  // paste `yc:<uid>` from a contest URL).
  const filtered = useMemo<SubmissionBrief[]>(() => {
    const rows = data?.data ?? [];
    const q = debouncedAuthor.trim().toLowerCase();
    return rows.filter((s) => {
      if (status && s.status !== status) return false;
      if (language && s.language !== language) return false;
      if (onlyLate && !s.is_late) return false;
      if (onlySuspicious && !s.flags?.suspicious) return false;
      if (q) {
        const haystack =
          (displayAuthor(s) ?? '').toLowerCase() +
          ' ' +
          (s.author_id ?? '').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [data, status, language, onlyLate, onlySuspicious, debouncedAuthor]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Посылки</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {assignment?.title ?? 'Задание'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline">
            <Link to={`/assignments/${id}/deadlines`}>Дедлайны</Link>
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div
          data-testid="assignment-submissions-filters"
          className="flex flex-wrap items-end gap-3"
        >
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="ID автора"
              value={author}
              onChange={(e) => setAuthor(e.currentTarget.value)}
              className="pl-9"
              data-testid="assignment-submissions-filter-author"
            />
          </div>

          <div className="w-44">
            <Select
              value={status ?? ALL}
              onValueChange={(v) =>
                setStatus(v === ALL ? undefined : (v as SubmissionStatus))
              }
            >
              <SelectTrigger data-testid="assignment-submissions-filter-status">
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Все статусы</SelectItem>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-44">
            <Select
              value={language ?? ALL}
              onValueChange={(v) =>
                setLanguage(v === ALL ? undefined : v)
              }
            >
              <SelectTrigger data-testid="assignment-submissions-filter-language">
                <SelectValue placeholder="Язык" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Все языки</SelectItem>
                {LANGUAGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="assignment-submissions-filter-late-switch"
              checked={onlyLate}
              onCheckedChange={(c) => setOnlyLate(c === true)}
              data-testid="assignment-submissions-filter-late"
            />
            <Label
              htmlFor="assignment-submissions-filter-late-switch"
              className="font-normal"
            >
              Только late
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="assignment-submissions-filter-suspicious-switch"
              checked={onlySuspicious}
              onCheckedChange={(c) => setOnlySuspicious(c === true)}
              data-testid="assignment-submissions-filter-suspicious"
            />
            <Label
              htmlFor="assignment-submissions-filter-suspicious-switch"
              className="font-normal"
            >
              Только подозрительные
            </Label>
          </div>
        </div>

        {isLoading ? null : <SubmissionsTable submissions={filtered} />}
      </div>
    </div>
  );
}
