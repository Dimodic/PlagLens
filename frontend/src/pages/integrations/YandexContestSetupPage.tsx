/**
 * /integrations/yandex-contest/setup — single-click connect for teachers.
 */
import { FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { integrationsApi } from '@/api/endpoints/integrations';
import { useTranslation } from '@/i18n';
import type { Problem } from '@/api/types';

export default function YandexContestSetupPage() {
  const { t } = useTranslation();
  useDocumentTitle('Yandex.Contest');
  const myCoursesQ = useMyCourses();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const courses: any[] = Array.isArray(myCoursesQ.data)
    ? myCoursesQ.data
    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((myCoursesQ.data as any)?.data ?? []);

  const [courseId, setCourseId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(() => {
    if (courses.length === 1 && !courseId) setCourseId(String(courses[0].id));
  }, [courses, courseId]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    if (!courseId) {
      setProblem({
        title: t('ycontest_setup.select_course'),
        status: 400,
        code: 'BAD_REQUEST',
      } as Problem);
      return;
    }
    setSubmitting(true);
    try {
      const created = (await integrationsApi.create({
        kind: 'yandex_contest',
        course_id: courseId,
        display_name: `Yandex.Contest — ${new Date().toLocaleDateString('ru-RU')}`,
        settings: {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any;
      const url: string | undefined =
        created?.oauth_authorize_url ?? created?.authorize_url;
      const cfgId: string | undefined = created?.config?.id ?? created?.id;
      let target = url;
      if (!target && cfgId) {
        const r = await integrationsApi.oauthStart(cfgId);
        target = r.authorize_url;
      }
      if (!target) {
         
        console.error('Unexpected create() response', created);
        throw {
          title: t('ycontest_setup.oauth_not_configured'),
          status: 500,
          code: 'INTERNAL',
        } as Problem;
      }
      window.location.href = target;
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
        ← {t('ycontest_setup.back_to_integrations')}
      </Link>
      <PageHeader title="Yandex.Contest" />

      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        {problem && <ProblemAlert problem={problem} />}

        <div className="space-y-1.5">
          <Label htmlFor="yc-course">{t('ycontest_setup.course')}</Label>
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger id="yc-course" data-testid="yc-course-select">
              <SelectValue placeholder={t('ycontest_setup.select_course')} />
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

        <div className="pt-2">
          <Button
            type="submit"
            disabled={submitting || !courseId}
            data-testid="yc-submit"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('ycontest_setup.connect')}
          </Button>
        </div>
      </form>
    </Page>
  );
}
