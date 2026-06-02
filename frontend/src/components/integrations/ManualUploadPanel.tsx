/**
 * ManualUploadPanel — the right-hand pane for «Ручная загрузка».
 *
 * Manual upload isn't a connected integration — there's nothing to
 * authorise, you just hand over a file. So this pane has no «Подключить»
 * step: pick the course + the one ДЗ the archive belongs to, choose the
 * file, upload. The endpoint is chosen by extension (.csv → CSV import,
 * otherwise the ZIP path), so there's no format switch — just a file.
 *
 * An archive is normally one ДЗ's worth of submissions, hence a single
 * ДЗ pick (not the multi-select the pull sources use).
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { useMyCourses } from '@/hooks/api/useCourses';
import { useManualUpload } from '@/hooks/api/useIntegrations';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/i18n';
import type { Problem } from '@/api/types';
import { ProviderIcon } from '@/components/integrations/ProviderIcon';
import { HomeworkSelect } from '@/components/integrations/HomeworkSelect';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function ManualUploadPanel() {
  const { t } = useTranslation();
  const notify = useNotifications();
  const coursesQ = useMyCourses();
  const courses = coursesQ.data?.data ?? [];
  const upload = useManualUpload();

  const [courseId, setCourseId] = useState('');
  const [homeworkId, setHomeworkId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{ items: number; students: number } | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!courseId && courses.length > 0) setCourseId(String(courses[0].id));
  }, [courseId, courses]);

  // Reset the ДЗ pick when the course changes — its homeworks differ.
  useEffect(() => {
    setHomeworkId('');
  }, [courseId]);

  const onUpload = async () => {
    if (!file) return;
    try {
      const res = await upload.mutateAsync({
        file,
        course_id: courseId || null,
        homework_id: homeworkId || null,
      });
      setResult({ items: res.summary.items, students: res.summary.students });
      notify.success(t('manual_upload.upload_success'));
      setFile(null);
      if (inputRef.current) inputRef.current.value = '';
    } catch (e) {
      notify.error((e as Problem)?.detail ?? t('manual_upload.upload_error'));
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-2">
        <ProviderIcon kind="manual" className="h-7 w-7 shrink-0" />
        <h2 className="text-xl font-semibold text-foreground">{t('manual_upload.title')}</h2>
      </header>

      <p className="max-w-md text-sm text-muted-foreground">
        {t('manual_upload.description')}
      </p>

      {/* Course */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t('manual_upload.course_label')}
        </label>
        <Select value={courseId} onValueChange={setCourseId}>
          <SelectTrigger className="max-w-sm" data-testid="manual-upload-course">
            <SelectValue placeholder={t('manual_upload.course_placeholder')} />
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

      {/* Homework (single) */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {t('manual_upload.homework_label')}
        </label>
        <HomeworkSelect
          courseId={courseId || undefined}
          value={homeworkId}
          onChange={setHomeworkId}
          placeholder={t('manual_upload.homework_placeholder')}
          testId="manual-upload-homework"
        />
        <p className="text-xs text-muted-foreground">
          {t('manual_upload.homework_hint')}
        </p>
      </div>

      {/* File + upload */}
      <div className="space-y-3 border-t border-border/50 pt-5">
        <input
          ref={inputRef}
          type="file"
          accept=".zip,.csv"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setResult(null);
          }}
          className="block w-full max-w-sm text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-foreground hover:file:bg-muted/70"
          data-testid="manual-upload-file"
        />

        <Button
          onClick={onUpload}
          disabled={!file || upload.isPending}
          data-testid="manual-upload-submit"
          className="shrink-0"
        >
          {upload.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          {t('manual_upload.submit')}
        </Button>

        {result && (
          <p
            className="text-xs text-muted-foreground"
            data-testid="manual-upload-result"
          >
            {t('manual_upload.result', {
              items: result.items,
              students: result.students,
            })}
          </p>
        )}
      </div>
    </div>
  );
}

export default ManualUploadPanel;
