/**
 * AssignmentSettingsPage — edit assignment + grading config rubric.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useAssignment,
  useGradingConfig,
  useUpdateAssignment,
  useUpdateGradingConfig,
} from '@/hooks/api/useAssignments';
import { Page, PageHeader } from '@/components/layout/Page';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { useNotifications } from '@/hooks/useNotifications';
import { parseProblem } from '@/api/problem';
import type { Problem } from '@/api/types';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useTranslation } from '@/i18n';

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const tzOffsetMs = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export default function AssignmentSettingsPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('assignment_settings.title'));
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const notify = useNotifications();
  const { data: assignment } = useAssignment(id);
  const { data: grading } = useGradingConfig(id);
  const updateAssignment = useUpdateAssignment(id ?? '');
  const updateGrading = useUpdateGradingConfig(id ?? '');
  const [problem, setProblem] = useState<Problem | null>(null);

  // General form
  const [title, setTitle] = useState('');
  const [maxScore, setMaxScore] = useState<number>(10);
  const [weight, setWeight] = useState<number>(1);

  // Grading form
  const [rubric, setRubric] = useState<string>('{}');
  const [passThreshold, setPassThreshold] = useState<number>(0);
  const [visibleAt, setVisibleAt] = useState<string | null>(null);

  useEffect(() => {
    if (assignment) {
      setTitle(assignment.title);
      setMaxScore(assignment.max_score ?? 10);
      setWeight(assignment.weight ?? 1);
    }
  }, [assignment?.id]);

  useEffect(() => {
    if (grading) {
      setRubric(JSON.stringify(grading.rubric, null, 2));
      setPassThreshold(grading.pass_threshold ?? 0);
      setVisibleAt(grading.visible_to_students_at ?? null);
    }
  }, [grading?.visible_to_students_at, grading?.pass_threshold]);

  if (!assignment) return null;

  const handleGeneralSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateAssignment.mutateAsync({
        title,
        max_score: maxScore,
        weight,
      });
      notify.success(t('assignment_settings.saved'));
    } catch (err) {
      setProblem(parseProblem(err));
    }
  };

  const handleGradingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    let parsedRubric: Record<string, unknown> = {};
    try {
      parsedRubric = JSON.parse(rubric || '{}');
    } catch {
      setProblem({
        title: t('assignment_settings.invalid_rubric_json'),
        status: 0,
        code: 'CLIENT_ERROR',
      });
      return;
    }
    try {
      await updateGrading.mutateAsync({
        rubric: parsedRubric,
        pass_threshold: passThreshold,
        visible_to_students_at: visibleAt,
      });
      notify.success(t('assignment_settings.saved'));
    } catch (err) {
      setProblem(parseProblem(err));
    }
  };

  return (
    // Use the standard Page wrapper so we get the project-wide
    // max-w-[1080px] + horizontal padding instead of the previous
    // edge-to-edge layout. The subtitle (assignment title) is dropped —
    // breadcrumbs already show "Course › Homework › Assignment" up top.
    <Page width="regular">
      <PageHeader title={t('assignment_settings.title')} />

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger
            value="general"
            data-testid="assignment-settings-tab-general"
          >
            {t('assignment_settings.tab_general')}
          </TabsTrigger>
          <TabsTrigger
            value="grading"
            data-testid="assignment-settings-tab-grading"
          >
            {t('assignment_settings.tab_grading')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="pt-4">
          <form onSubmit={handleGeneralSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="assignment-settings-title-input">
                {t('assignment_settings.name_label')}
              </Label>
              <Input
                id="assignment-settings-title-input"
                data-testid="assignment-settings-title"
                value={title}
                onChange={(e) => setTitle(e.currentTarget.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="assignment-settings-max-score-input">
                  {t('assignment_settings.max_score_label')}
                </Label>
                <Input
                  id="assignment-settings-max-score-input"
                  type="number"
                  min={0}
                  max={100}
                  data-testid="assignment-settings-max_score"
                  value={maxScore}
                  onChange={(e) =>
                    setMaxScore(Number(e.currentTarget.value))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="assignment-settings-weight-input">
                  {t('assignment_settings.weight_label')}
                </Label>
                <Input
                  id="assignment-settings-weight-input"
                  type="number"
                  min={0}
                  max={10}
                  step={0.1}
                  data-testid="assignment-settings-weight"
                  value={weight}
                  onChange={(e) => setWeight(Number(e.currentTarget.value))}
                />
              </div>
            </div>
            <ProblemAlert problem={problem} />
            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate(`/assignments/${id}`)}
                data-testid="assignment-settings-back"
              >
                {t('common.back')}
              </Button>
              <Button
                type="submit"
                disabled={updateAssignment.isPending}
                data-testid="assignment-settings-submit"
              >
                {updateAssignment.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t('common.save')}
              </Button>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="grading" className="pt-4">
          <form onSubmit={handleGradingSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="assignment-grading-rubric-input">
                {t('assignment_settings.rubric_label')}
              </Label>
              <Textarea
                id="assignment-grading-rubric-input"
                rows={6}
                data-testid="assignment-grading-rubric"
                value={rubric}
                onChange={(e) => setRubric(e.currentTarget.value)}
                className="font-mono text-[13px]"
              />
              <p className="text-xs text-muted-foreground">
                {t('assignment_settings.rubric_hint')}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assignment-grading-pass-threshold-input">
                {t('assignment_settings.pass_threshold_label')}
              </Label>
              <Input
                id="assignment-grading-pass-threshold-input"
                type="number"
                min={0}
                max={assignment.max_score ?? 100}
                step={0.5}
                data-testid="assignment-grading-pass_threshold"
                value={passThreshold}
                onChange={(e) =>
                  setPassThreshold(Number(e.currentTarget.value))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="assignment-grading-visible-at-input">
                {t('assignment_settings.visible_at_label')}
              </Label>
              <Input
                id="assignment-grading-visible-at-input"
                type="datetime-local"
                data-testid="assignment-grading-visible_at"
                value={toLocalInput(visibleAt)}
                onChange={(e) =>
                  setVisibleAt(fromLocalInput(e.currentTarget.value))
                }
              />
              <p className="text-xs text-muted-foreground">
                {t('assignment_settings.visible_at_hint')}
              </p>
            </div>

            <ProblemAlert problem={problem} />

            <div className="flex items-center justify-end">
              <Button
                type="submit"
                disabled={updateGrading.isPending}
                data-testid="assignment-grading-submit"
              >
                {updateGrading.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {t('common.save')}
              </Button>
            </div>
          </form>
        </TabsContent>
      </Tabs>
    </Page>
  );
}
