/**
 * Modal: turn an AI analysis into editable SubmissionFeedback.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { RiskSignalBadge } from '@/components/ai/RiskSignalBadge';
import { useNotifications } from '@/hooks/useNotifications';
import { useCurateAsFeedback } from '@/hooks/api/useAi';
import type { AIAnalysis, RiskSignalType } from '@/api/endpoints/ai';
import type { Problem } from '@/api/types';

interface CurateAsFeedbackModalProps {
  opened: boolean;
  analysis: AIAnalysis | null;
  onClose: () => void;
  /** Submission id to redirect feedback tab to. */
  submissionId?: string;
}

export function CurateAsFeedbackModal({
  opened,
  analysis,
  onClose,
  submissionId,
}: CurateAsFeedbackModalProps) {
  const notify = useNotifications();
  const navigate = useNavigate();
  const curate = useCurateAsFeedback(analysis?.id ?? '');

  const [summary, setSummary] = useState('');
  const [includeSignals, setIncludeSignals] = useState<Set<RiskSignalType>>(new Set());
  const [includeQuestions, setIncludeQuestions] = useState<Set<number>>(new Set());
  const [editedQuestions, setEditedQuestions] = useState<Record<number, string>>({});
  const [additional, setAdditional] = useState('');
  const [visibleToStudent, setVisibleToStudent] = useState(false);

  useEffect(() => {
    if (analysis?.report) {
      setSummary(analysis.report.summary);
      setIncludeSignals(new Set(analysis.report.risk_signals.map((s) => s.type)));
      setIncludeQuestions(new Set(analysis.report.questions.map((_, i) => i)));
      setEditedQuestions({});
      setAdditional('');
      setVisibleToStudent(false);
    }
  }, [analysis]);

  if (!analysis) return null;
  const r = analysis.report;
  if (!r) return null;

  const toggleSignal = (t: RiskSignalType) => {
    const next = new Set(includeSignals);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    setIncludeSignals(next);
  };

  const toggleQuestion = (i: number) => {
    const next = new Set(includeQuestions);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setIncludeQuestions(next);
  };

  const handleSubmit = async () => {
    try {
      await curate.mutateAsync({
        edited_summary: summary,
        include_risk_signals: Array.from(includeSignals),
        include_questions: Array.from(includeQuestions),
        additional_text: additional || undefined,
        visible_to_student: visibleToStudent,
      });
      notify.success('Комментарий создан');
      onClose();
      if (submissionId) {
        navigate(`/submissions/${submissionId}?tab=feedback`);
      }
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? 'Не удалось создать комментарий');
    }
  };

  return (
    <Dialog open={opened} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent
        data-testid="ai-curate-modal"
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>Создать комментарий из AI-отчёта</DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-1">
            <Label className="text-sm font-medium">
              Резюме (редактируется)
            </Label>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.currentTarget.value)}
              rows={5}
              data-testid="ai-curate-summary"
            />
          </div>

          <div className="space-y-2">
            <h5 className="text-base font-medium">Risk signals</h5>
            {r.risk_signals.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет сигналов.</p>
            ) : (
              <div className="space-y-2">
                {r.risk_signals.map((s, i) => (
                  <label
                    key={`${s.type}-${i}`}
                    className="flex items-start gap-2 cursor-pointer"
                  >
                    <Checkbox
                      checked={includeSignals.has(s.type)}
                      onCheckedChange={() => toggleSignal(s.type)}
                      data-testid={`ai-curate-include-${s.type}`}
                      className="mt-0.5"
                    />
                    <span className="flex flex-wrap items-center gap-2">
                      <RiskSignalBadge type={s.type} severity={s.severity} />
                      <span className="text-xs text-muted-foreground">{s.details}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h5 className="text-base font-medium">Вопросы для устной проверки</h5>
            {r.questions.length === 0 ? (
              <p className="text-sm text-muted-foreground">Нет вопросов.</p>
            ) : (
              <div className="space-y-3">
                {r.questions.map((q, i) => (
                  <div key={i} className="space-y-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={includeQuestions.has(i)}
                        onCheckedChange={() => toggleQuestion(i)}
                      />
                      <span className="text-sm">{`Вопрос #${i + 1}`}</span>
                    </label>
                    {includeQuestions.has(i) && (
                      <Textarea
                        rows={2}
                        value={editedQuestions[i] ?? q}
                        onChange={(e) =>
                          setEditedQuestions({
                            ...editedQuestions,
                            [i]: e.currentTarget.value,
                          })
                        }
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-sm font-medium">
              Доп. текст от преподавателя
            </Label>
            <Textarea
              value={additional}
              onChange={(e) => setAdditional(e.currentTarget.value)}
              rows={3}
              placeholder="Например: «Проверь, понимает ли студент сложность алгоритма устно»"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <Switch
              checked={visibleToStudent}
              onCheckedChange={setVisibleToStudent}
              data-testid="ai-curate-visible-to-student"
            />
            <span className="text-sm">Показать студенту</span>
          </label>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={onClose}
            data-testid="ai-curate-cancel"
          >
            Отмена
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={curate.isPending}
            data-testid="ai-curate-submit"
          >
            {curate.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Сохранить как комментарий
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CurateAsFeedbackModal;
