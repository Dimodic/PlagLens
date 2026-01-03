/**
 * SubmissionUploadPage — student-facing upload form using a native
 * <input type="file"> with drag-and-drop wrapper.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, Upload, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAssignment } from '@/hooks/api/useAssignments';
import { useUploadSubmission } from '@/hooks/api/useSubmissions';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { useNotifications } from '@/hooks/useNotifications';
import { parseProblem } from '@/api/problem';
import { formatBytes } from '@/utils/formatters';
import type { Problem } from '@/api/types';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useAuth } from '@/auth/useAuth';
import { cn } from '@/components/ui/utils';

const LANGUAGE_OPTIONS = [
  { value: 'python', label: 'Python' },
  { value: 'cpp', label: 'C++' },
  { value: 'java', label: 'Java' },
  { value: 'go', label: 'Go' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'csharp', label: 'C#' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'rust', label: 'Rust' },
  { value: 'other', label: 'Другой' },
];

const MAX_TOTAL_SIZE = 50 * 1024 * 1024;

export default function SubmissionUploadPage() {
  useDocumentTitle('Загрузить посылку');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const notify = useNotifications();
  const { user } = useAuth();
  const isStudent = user?.global_role === 'student';

  const { data: assignment } = useAssignment(id);
  const upload = useUploadSubmission(id ?? '');

  const [files, setFiles] = useState<File[]>([]);
  const [language, setLanguage] = useState<string>('python');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize language from assignment when it loads.
  useEffect(() => {
    if (assignment?.language_hint) {
      setLanguage(assignment.language_hint);
    }
  }, [assignment?.language_hint]);

  const addFiles = (added: File[]) => {
    if (added.length === 0) return;
    const next = [...files, ...added];
    const totalSize = next.reduce((acc, f) => acc + f.size, 0);
    if (totalSize > MAX_TOTAL_SIZE) {
      setProblem({
        title: 'Не удалось принять файлы',
        detail: 'Превышен максимальный размер 50 МБ.',
        status: 0,
        code: 'CLIENT_ERROR',
      });
      return;
    }
    setFiles(next);
    setProblem(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    addFiles(dropped);
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleSubmit = async () => {
    setProblem(null);
    if (files.length === 0) {
      setProblem({
        title: 'Выберите хотя бы один файл',
        status: 0,
        code: 'CLIENT_ERROR',
      });
      return;
    }
    const formData = new FormData();
    formData.append('language', language);
    formData.append('source', 'manual');
    files.forEach((f) => formData.append('files', f));

    setProgress(20);
    try {
      const res = await upload.mutateAsync(formData);
      setProgress(100);
      notify.success('Посылка отправлена');
      // Result is either a Submission (with `id`) or an Operation. Students
      // are routed to the student-facing detail page; teachers stay on the
      // teacher namespace.
      if (res && typeof res === 'object' && 'id' in res && 'submitted_at' in res) {
        const newId = (res as { id: string }).id;
        navigate(isStudent ? `/me/submissions/${newId}` : `/submissions/${newId}`);
      } else {
        navigate(isStudent ? '/me/submissions' : '/submissions');
      }
    } catch (e) {
      setProgress(0);
      setProblem(parseProblem(e));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Загрузить посылку
        </h1>
        {assignment?.title && (
          <p className="mt-1 text-sm text-muted-foreground">
            {assignment.title}
          </p>
        )}
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-1.5">
            <Label>Язык</Label>
            <Select value={language} onValueChange={(v) => setLanguage(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <label
            data-testid="submission-dropzone"
            htmlFor="submission-files-input"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              'flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/20 px-6 py-8 cursor-pointer transition-colors',
              isDragging && 'border-primary bg-primary/5',
            )}
          >
            <Upload className="h-8 w-8 text-muted-foreground" />
            <span className="text-sm font-medium">
              Перетащите файлы или нажмите, чтобы выбрать
            </span>
            <span className="text-xs text-muted-foreground">
              Максимум 50 МБ суммарно. Поддерживаются архивы (.zip).
            </span>
            <input
              ref={inputRef}
              id="submission-files-input"
              type="file"
              multiple
              className="sr-only"
              onChange={(e) => {
                const list = Array.from(e.currentTarget.files ?? []);
                addFiles(list);
                // Reset input so re-selecting the same file works.
                e.currentTarget.value = '';
              }}
            />
          </label>

          {files.length > 0 && (
            <div className="space-y-1">
              {files.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm truncate">{f.name}</span>
                    <Badge variant="secondary" className="font-normal text-xs">
                      {formatBytes(f.size)}
                    </Badge>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setFiles((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    className="text-destructive hover:text-destructive"
                  >
                    <X className="mr-1 h-4 w-4" />
                    Убрать
                  </Button>
                </div>
              ))}
            </div>
          )}

          {progress > 0 && progress < 100 && (
            <Progress
              value={progress}
              data-testid="submission-upload-progress"
            />
          )}

          <ProblemAlert problem={problem} />

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() =>
                navigate(
                  isStudent ? `/me/assignments/${id}` : `/assignments/${id}`,
                )
              }
              data-testid="submission-upload-cancel"
            >
              Отмена
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={upload.isPending}
              data-testid="submission-upload-submit"
            >
              {upload.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Отправить
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
