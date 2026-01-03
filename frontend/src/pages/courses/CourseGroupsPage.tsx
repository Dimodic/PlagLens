/**
 * CourseGroupsPage — list groups and create new ones.
 */
import { FormEvent, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import {
  useCourse,
  useCreateGroup,
  useDeleteGroup,
  useGroups,
} from '@/hooks/api/useCourses';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { Page, PageHeader } from '@/components/layout/Page';
import { useAuth } from '@/auth/useAuth';
import { hasCourseRole, hasGlobalRole } from '@/auth/RoleGuard';
import { useNotifications } from '@/hooks/useNotifications';
import { parseProblem } from '@/api/problem';
import type { Problem } from '@/api/types';
import type { Group as CourseGroup } from '@/api/endpoints/courses';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface FormVals {
  name: string;
  capacity: number | null;
}

const INITIAL_FORM: FormVals = { name: '', capacity: 30 };

export default function CourseGroupsPage() {
  useDocumentTitle('Группы курса');
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const notify = useNotifications();

  const { data: course } = useCourse(slug);
  const { data: groups, isLoading } = useGroups(course?.id);
  const create = useCreateGroup(course?.id ?? '');
  const remove = useDeleteGroup(course?.id ?? '');

  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<CourseGroup | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [form, setForm] = useState<FormVals>(INITIAL_FORM);
  const [nameError, setNameError] = useState<string | null>(null);

  const canManage =
    course && user
      ? hasCourseRole(user, course.id, ['owner', 'co_owner']) ||
        hasGlobalRole(user, ['admin', 'super_admin'])
      : false;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 1) {
      setNameError('Название обязательно');
      return;
    }
    setNameError(null);
    try {
      await create.mutateAsync({
        name: form.name,
        capacity: form.capacity,
      });
      notify.success('Группа создана');
      setOpen(false);
      setForm(INITIAL_FORM);
    } catch (e) {
      setProblem(parseProblem(e));
    }
  };

  return (
    <Page width="wide">
      <PageHeader
        title={<span data-testid="course-groups-title">Группы</span>}
        action={
          canManage ? (
            <Button
              onClick={() => setOpen(true)}
              data-testid="course-groups-create-button"
            >
              <Plus className="mr-2 h-4 w-4" />
              Новая группа
            </Button>
          ) : undefined
        }
      />

      <ProblemAlert problem={problem} />

      {!isLoading && (groups?.data.length ?? 0) === 0 ? (
        <EmptyState
          title="Нет групп"
          message="Создайте первую группу, чтобы делить студентов на потоки."
        />
      ) : (
        <div className="space-y-3">
          {groups?.data.map((g) => (
            <Card key={g.id} data-testid={`group-${g.id}`}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-2">
                  <strong>{g.name}</strong>
                  {typeof g.capacity === 'number' && (
                    <Badge variant="secondary" className="font-normal">
                      мест: {g.capacity}
                    </Badge>
                  )}
                </div>
                {canManage && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setConfirm(g)}
                    aria-label="Удалить"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Новая группа</DialogTitle>
          </DialogHeader>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="group-name">Название</Label>
              <Input
                id="group-name"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
                required
                data-testid="course-groups-name"
                aria-invalid={!!nameError}
              />
              {nameError && (
                <p role="alert" className="text-xs text-destructive">
                  {nameError}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="group-capacity">Вместимость</Label>
              <Input
                id="group-capacity"
                type="number"
                min={1}
                max={1000}
                value={form.capacity ?? ''}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    capacity: e.target.value
                      ? Number(e.target.value)
                      : null,
                  }))
                }
                data-testid="course-groups-capacity"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={create.isPending}
                data-testid="course-groups-submit"
              >
                {create.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Создать
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        opened={!!confirm}
        title="Удалить группу?"
        message={confirm ? `Группа «${confirm.name}» будет удалена.` : ''}
        destructive
        confirmLabel="Удалить"
        loading={remove.isPending}
        onConfirm={async () => {
          if (!confirm) return;
          try {
            await remove.mutateAsync(confirm.id);
            notify.success('Группа удалена');
          } catch (e) {
            setProblem(parseProblem(e));
          }
          setConfirm(null);
        }}
        onClose={() => setConfirm(null)}
      />
    </Page>
  );
}
