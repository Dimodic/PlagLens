/**
 * /integrations/ejudge/setup — eJudge token-based setup.
 */
import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
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
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useMyCourses } from '@/hooks/api/useCourses';
import { useNotifications } from '@/hooks/useNotifications';
import { integrationsApi } from '@/api/endpoints/integrations';
import type { Problem } from '@/api/types';

export default function EjudgeSetupPage() {
  useDocumentTitle('eJudge');
  const navigate = useNavigate();
  const notify = useNotifications();
  const myCoursesQ = useMyCourses();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const courses: any[] = Array.isArray(myCoursesQ.data)
    ? myCoursesQ.data
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((myCoursesQ.data as any)?.data ?? []);

  const [courseId, setCourseId] = useState<string>('');
  const [baseUrl, setBaseUrl] = useState('https://ejudge.example.org');
  const [apiKey, setApiKey] = useState('');
  const [contestIds, setContestIds] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(() => {
    if (courses.length === 1 && !courseId) setCourseId(String(courses[0].id));
  }, [courses, courseId]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    if (!courseId || !baseUrl || !apiKey) {
      setProblem({
        title: 'Заполните все поля',
        status: 400,
        code: 'BAD_REQUEST',
      } as Problem);
      return;
    }
    setSubmitting(true);
    try {
      const created = (await integrationsApi.create({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        kind: 'ejudge' as any,
        course_id: courseId,
        display_name: `eJudge — ${new Date().toLocaleDateString('ru-RU')}`,
        settings: {
          base_url: baseUrl.trim(),
          api_key: apiKey.trim(),
          contest_ids: contestIds
            .split(/[,\s]+/)
            .filter(Boolean)
            .map((s) => Number(s))
            .filter((n) => Number.isFinite(n)),
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any;
      notify.success('Интеграция сохранена');
      navigate(`/integrations`);
      void created;
    } catch (raw) {
      setProblem(raw as Problem);
      setSubmitting(false);
    }
  };

  return (
    <Page width="narrow">
      <Link
        to="/integrations"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Интеграции
      </Link>
      <PageHeader title="eJudge" />

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {problem && <ProblemAlert problem={problem} />}

        <div className="space-y-1.5">
          <Label htmlFor="ejudge-course">Курс</Label>
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger id="ejudge-course">
              <SelectValue placeholder="Выберите курс" />
            </SelectTrigger>
            <SelectContent>
              {courses.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ejudge-base-url">Base URL</Label>
          <Input
            id="ejudge-base-url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            className="font-mono text-xs"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ejudge-api-key">API token</Label>
          <Input
            id="ejudge-api-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="font-mono text-xs"
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ejudge-contest-ids">Contest IDs</Label>
          <Input
            id="ejudge-contest-ids"
            value={contestIds}
            onChange={(e) => setContestIds(e.target.value)}
            className="font-mono text-xs"
          />
        </div>

        <div className="pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Сохранить
          </Button>
        </div>
      </form>
    </Page>
  );
}
