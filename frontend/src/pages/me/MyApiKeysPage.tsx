/**
 * /me/api-keys — list, create, rotate, revoke API keys.
 */
import { Plus, RefreshCw, Trash2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import dayjs from 'dayjs';
import { Breadcrumbs } from '@/layout/Breadcrumbs';
import { Page, PageHeader } from '@/components/layout/Page';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { EmptyState } from '@/components/common/EmptyState';
import { ApiKeyCreateModal } from '@/components/me/ApiKeyCreateModal';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import {
  useApiKeys,
  useCreateApiKey,
  useDeleteApiKey,
  useRotateApiKey,
} from '@/hooks/api/useUsers';
import type { ApiKeyCreated } from '@/api/endpoints/users';
import type { Problem } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusPill } from '@/components/common/StatusPill';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function MyApiKeysPage() {
  useDocumentTitle('API keys');
  const notify = useNotifications();
  const { data, isLoading, error, refetch } = useApiKeys();
  const create = useCreateApiKey();
  const rotate = useRotateApiKey();
  const remove = useDeleteApiKey();

  const [modalOpen, setModalOpen] = useState(false);
  const [rotated, setRotated] = useState<ApiKeyCreated | null>(null);

  const handleCreate = async (input: { name: string; scopes: string[] }) => {
    const r = await create.mutateAsync(input);
    refetch();
    return r;
  };

  const handleRotate = async (id: string) => {
    try {
      const r = await rotate.mutateAsync(id);
      setRotated(r);
      notify.success('Ключ ротирован');
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await remove.mutateAsync(id);
      notify.success('Ключ отозван');
      refetch();
    } catch (e) {
      notify.error((e as Problem)?.detail ?? 'Не удалось');
    }
  };

  return (
    <Page>
      <Breadcrumbs />
      <PageHeader
        title="API keys"
        action={
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Создать
          </Button>
        }
      />

        {error && <ProblemAlert problem={error as unknown as Problem} />}

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : data && data.length === 0 ? (
          <EmptyState
            title="API ключей нет"
            action={
              <Button onClick={() => setModalOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Создать
              </Button>
            }
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Имя</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Last used</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.map((k) => (
                  <TableRow key={k.id} data-testid={`api-key-row-${k.id}`}>
                    <TableCell>
                      <div className="text-sm font-medium">{k.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">
                        {k.id}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1">
                        {k.scopes.map((s) => (
                          <StatusPill key={s} tone="neutral">{s}</StatusPill>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {k.last_used_at
                          ? dayjs(k.last_used_at).format('DD.MM.YYYY HH:mm')
                          : '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {k.expires_at
                          ? dayjs(k.expires_at).format('DD.MM.YYYY')
                          : 'never'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRotate(k.id)}
                          disabled={rotate.isPending}
                        >
                          {rotate.isPending ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-2 h-3.5 w-3.5" />
                          )}
                          Rotate
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(k.id)}
                          disabled={remove.isPending}
                        >
                          {remove.isPending ? (
                            <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="mr-2 h-3.5 w-3.5" />
                          )}
                          Revoke
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        <ApiKeyCreateModal
          opened={modalOpen}
          onClose={() => setModalOpen(false)}
          onCreate={handleCreate}
        />

        {rotated && (
          <ApiKeyCreateModal
            opened
            onClose={() => setRotated(null)}
            onCreate={async () => rotated}
          />
        )}
    </Page>
  );
}

export default MyApiKeysPage;
