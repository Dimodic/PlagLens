/**
 * /admin/ai/prompt-versions — list of prompt versions, mark active, edit, test.
 */
import { useState } from 'react';
import dayjs from 'dayjs';
import { Check, FlaskConical, Loader2, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { StatusPill } from '@/components/common/StatusPill';
import { Page, PageHeader } from '@/components/layout/Page';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { CodeBlock } from '@/components/common/CodeBlock';
import { PromptEditor } from '@/components/ai/PromptEditor';
import { CostFormatter } from '@/components/ai/CostFormatter';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useActivatePromptVersion,
  usePromptVersion,
  usePromptVersions,
  useTestPromptVersion,
} from '@/hooks/api/useAi';
import type { PromptVersion } from '@/api/endpoints/ai';
import type { Problem } from '@/api/types';

interface DetailModalProps {
  versionId: string | null;
  opened: boolean;
  onClose: () => void;
}

function DetailModal({ versionId, opened, onClose }: DetailModalProps) {
  const { data, isLoading } = usePromptVersion(versionId ?? undefined);
  const test = useTestPromptVersion(versionId ?? '');
  const [code, setCode] = useState('def add(a, b):\n    return a + b\n');
  const [language, setLanguage] = useState('python');

  return (
    <Dialog open={opened} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{`Prompt version: ${versionId ?? ''}`}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">Не найдено</p>
        ) : (
          <Tabs defaultValue="prompt">
            <TabsList>
              <TabsTrigger value="prompt">Prompt</TabsTrigger>
              <TabsTrigger value="test">
                <FlaskConical className="mr-2 h-3.5 w-3.5" />
                Sandbox
              </TabsTrigger>
            </TabsList>
            <TabsContent value="prompt" className="pt-3">
              <PromptEditor value={data} readOnly />
            </TabsContent>
            <TabsContent value="test" className="pt-3">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Label htmlFor="prompt-language" className="text-sm font-medium">
                    Язык:
                  </Label>
                  <Select value={language} onValueChange={(v) => v && setLanguage(v)}>
                    <SelectTrigger id="prompt-language" className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="python">python</SelectItem>
                      <SelectItem value="cpp">cpp</SelectItem>
                      <SelectItem value="java">java</SelectItem>
                      <SelectItem value="javascript">javascript</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sandbox-code">Тестовый код</Label>
                  <Textarea
                    id="sandbox-code"
                    value={code}
                    onChange={(e) => setCode(e.currentTarget.value)}
                    rows={10}
                    className="font-mono"
                    data-testid="prompt-sandbox-code"
                  />
                </div>
                <Button
                  onClick={() => test.mutate({ code, language })}
                  disabled={test.isPending}
                  data-testid="prompt-sandbox-run"
                >
                  {test.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FlaskConical className="mr-2 h-4 w-4" />
                  )}
                  Прогнать
                </Button>
                {test.data && (
                  <div className="space-y-3" data-testid="prompt-sandbox-result">
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-muted-foreground">
                        Latency: <span className="font-medium">{test.data.latency_ms}ms</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Tokens: <span className="font-medium">{test.data.tokens_used}</span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Cost: <CostFormatter value={test.data.cost_estimate} />
                      </span>
                    </div>
                    <Card>
                      <CardContent className="p-4">
                        <h5 className="mb-2 text-sm font-medium">Parsed report</h5>
                        {test.data.report ? (
                          <CodeBlock
                            code={JSON.stringify(test.data.report, null, 2)}
                            language="json"
                            maxHeight={300}
                          />
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Не удалось распарсить.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <h5 className="mb-2 text-sm font-medium">Raw LLM</h5>
                        <CodeBlock
                          code={test.data.raw_response}
                          language="markdown"
                          maxHeight={200}
                        />
                      </CardContent>
                    </Card>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PromptVersionsPage() {
  useDocumentTitle('Prompt versions');
  const notify = useNotifications();
  const { data, isLoading, error } = usePromptVersions({ limit: 200 });
  const activate = useActivatePromptVersion();
  const [openId, setOpenId] = useState<string | null>(null);

  const handleActivate = async (v: PromptVersion) => {
    try {
      await activate.mutateAsync(v.id);
      notify.success(`Версия ${v.id} активна`);
    } catch (e) {
      const p = e as Problem;
      notify.error(p?.detail ?? p?.title ?? 'Не удалось активировать');
    }
  };

  return (
    <Page width="regular">
      <PageHeader title="Prompt versions" />

      <div className="space-y-4">
        {error && <ProblemAlert problem={error as unknown as Problem} />}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data && (data.data?.length ?? 0) === 0 ? (
          <EmptyState title="Версий нет" />
        ) : (
          <div className="space-y-3" data-testid="prompt-versions-list">
            {data?.data?.map((v) => (
              <Card key={v.id} data-testid={`prompt-version-card-${v.id}`}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-medium">{v.id}</h4>
                        {v.active_for_tenant && (
                          <StatusPill tone="success">
                            <Star className="mr-1 h-3 w-3" />
                            active
                          </StatusPill>
                        )}
                      </div>
                      <p className="text-sm">{v.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Создано {dayjs(v.created_at).format('DD.MM.YYYY')}
                        {v.deactivated_at && (
                          <> • деактивирована {dayjs(v.deactivated_at).format('DD.MM.YYYY')}</>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setOpenId(v.id)}
                        data-testid={`prompt-version-open-${v.id}`}
                      >
                        Открыть
                      </Button>
                      {!v.active_for_tenant && (
                        <Button
                          variant="outline"
                          onClick={() => handleActivate(v)}
                          disabled={activate.isPending}
                          data-testid={`prompt-version-activate-${v.id}`}
                          className="text-emerald-600 border-emerald-600 hover:text-emerald-600"
                        >
                          {activate.isPending ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="mr-2 h-4 w-4" />
                          )}
                          Сделать активной
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <DetailModal
          versionId={openId}
          opened={openId != null}
          onClose={() => setOpenId(null)}
        />
      </div>
    </Page>
  );
}

export default PromptVersionsPage;
