/**
 * /me/external-bindings — bind Stepik / Yandex.Contest user IDs.
 */
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import dayjs from 'dayjs';
import { Breadcrumbs } from '@/layout/Breadcrumbs';
import { Page, PageHeader } from '@/components/layout/Page';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useAddMyExternalBinding,
  useMyExternalBindings,
  useRemoveMyExternalBinding,
} from '@/hooks/api/useUsers';
import type { Problem } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function MyExternalBindingsPage() {
  useDocumentTitle('Внешние привязки');
  const notify = useNotifications();
  const { data, isLoading, error, refetch } = useMyExternalBindings();
  const addM = useAddMyExternalBinding();
  const removeM = useRemoveMyExternalBinding();

  const [system, setSystem] = useState<'stepik' | 'yandex_contest'>('stepik');
  const [externalId, setExternalId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);

  const handleAdd = async () => {
    setProblem(null);
    if (!externalId.trim()) {
      setProblem({
        title: 'external_id обязателен',
        status: 400,
        code: 'REQUIRED',
      });
      return;
    }
    try {
      await addM.mutateAsync({
        system,
        external_id: externalId.trim(),
        display_name: displayName.trim() || undefined,
      });
      notify.success('Привязка добавлена');
      setExternalId('');
      setDisplayName('');
      refetch();
    } catch (e) {
      setProblem(e as Problem);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await removeM.mutateAsync(id);
      notify.success('Удалено');
      refetch();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  return (
    <Page>
      <Breadcrumbs />
      <PageHeader title="Внешние привязки" />

        <Card>
          <CardContent className="p-6">
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Добавить привязку</h2>
              {problem && <ProblemAlert problem={problem} />}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="space-y-1.5" data-testid="bindings-add-system">
                  <Label htmlFor="bindings-system">Система</Label>
                  <Select
                    value={system}
                    onValueChange={(v) =>
                      setSystem((v as 'stepik' | 'yandex_contest') ?? 'stepik')
                    }
                  >
                    <SelectTrigger id="bindings-system" className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stepik">Stepik</SelectItem>
                      <SelectItem value="yandex_contest">Я.Контест</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="bindings-external-id">
                    External ID <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="bindings-external-id"
                    value={externalId}
                    onChange={(e) => setExternalId(e.target.value)}
                    data-testid="bindings-add-external-id"
                  />
                </div>
                <div className="flex-1 space-y-1.5">
                  <Label htmlFor="bindings-display-name">Display name</Label>
                  <Input
                    id="bindings-display-name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    data-testid="bindings-add-display-name"
                  />
                </div>
                <Button
                  onClick={handleAdd}
                  disabled={addM.isPending}
                  data-testid="bindings-add-submit"
                >
                  {addM.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="mr-2 h-4 w-4" />
                  )}
                  Добавить
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {error && <ProblemAlert problem={error as unknown as Problem} />}

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data && data.length === 0 ? (
          <EmptyState title="Привязок нет" />
        ) : (
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Система</TableHead>
                  <TableHead>External ID</TableHead>
                  <TableHead>Имя</TableHead>
                  <TableHead>Привязано</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.map((b) => (
                  <TableRow key={b.id} data-testid={`binding-row-${b.id}`}>
                    <TableCell>
                      <Badge variant="secondary" className="font-normal">
                        {b.system}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm font-mono">{b.external_id}</span>
                    </TableCell>
                    <TableCell>{b.display_name}</TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {dayjs(b.linked_at).format('DD.MM.YYYY')}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRemove(b.id)}
                        disabled={removeM.isPending}
                        data-testid={`binding-remove-${b.id}`}
                      >
                        {removeM.isPending ? (
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                        )}
                        Удалить
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
    </Page>
  );
}

export default MyExternalBindingsPage;
