/**
 * JoinByCodePage — student enters invitation code → joins course.
 * Code may be supplied via URL param `:code` (e.g. /courses/join/ABCD-1234)
 * or typed in.
 */
import { FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useJoinByCode } from '@/hooks/api/useCourses';
import { coursesApi } from '@/api/endpoints/courses';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { useNotifications } from '@/hooks/useNotifications';
import { parseProblem } from '@/api/problem';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';
import type { Problem } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Page, PageHeader } from '@/components/layout/Page';

export default function JoinByCodePage() {
  const { t } = useTranslation();
  useDocumentTitle(t('join_code_page.title'));
  const { code: codeParam } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const notify = useNotifications();
  const join = useJoinByCode();
  const [problem, setProblem] = useState<Problem | null>(null);
  const [code, setCode] = useState(codeParam ?? '');
  const [codeError, setCodeError] = useState<string | null>(null);

  useEffect(() => {
    if (codeParam) setCode(codeParam);
  }, [codeParam]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setProblem(null);
    if (code.trim().length < 4) {
      setCodeError(t('join_code_page.code_too_short'));
      return;
    }
    setCodeError(null);
    try {
      const res = await join.mutateAsync(code.trim());
      notify.success(t('join_code_page.join_success'));
      // Course route is /courses/:slug — the join endpoint currently returns
      // only { course_id }, so when no slug is included we fetch it.
      // TODO(backend): include `course_slug` (or full course brief) in the
      //                /courses:joinByCode response to avoid the extra fetch.
      const maybeSlug =
        (res as { course_slug?: string }).course_slug ??
        (res as { course?: { slug?: string } }).course?.slug;
      if (maybeSlug) {
        navigate(`/courses/${maybeSlug}`);
        return;
      }
      try {
        const course = await coursesApi.get(String(res.course_id));
        navigate(`/courses/${course.slug}`);
      } catch {
        // As a last resort, redirect to the courses list — better than a 404.
        navigate('/courses');
      }
    } catch (e) {
      setProblem(parseProblem(e));
    }
  };

  return (
    <Page width="narrow">
      <PageHeader title={t('join_code_page.title')} />

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="join-code">{t('join_code_page.code_label')}</Label>
              <Input
                id="join-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ABCD-1234"
                required
                autoFocus
                data-testid="join-code-input"
                aria-invalid={!!codeError}
              />
              {codeError && (
                <p role="alert" className="text-xs text-destructive">
                  {codeError}
                </p>
              )}
            </div>

            <ProblemAlert problem={problem} />

            <div className="flex justify-end">
              <Button
                type="submit"
                disabled={join.isPending}
                data-testid="join-submit"
              >
                {join.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t('join_code_page.submit')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </Page>
  );
}
