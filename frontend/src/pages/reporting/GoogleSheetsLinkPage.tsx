/**
 * GoogleSheetsLinkPage — link an existing spreadsheet to the course and
 * trigger a manual sync.
 */
import { Loader2, RefreshCw } from 'lucide-react';
import dayjs from 'dayjs';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Page, PageHeader } from '@/components/layout/Page';
import { useCourse } from '@/hooks/api/useCourses';
import {
  useGoogleSheetsLastSync,
  useGoogleSheetsLink,
  useSetSheetsLink,
  useSyncSheets,
} from '@/hooks/api/useReporting';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import type { Problem } from '@/api/types';

export default function GoogleSheetsLinkPage() {
  useDocumentTitle('Google Sheets');
  const { slug } = useParams<{ slug: string }>();
  const { data: course } = useCourse(slug);
  const courseId = course?.id;
  const link = useGoogleSheetsLink(courseId);
  const lastSync = useGoogleSheetsLastSync(courseId);
  const set = useSetSheetsLink(courseId ?? '');
  const sync = useSyncSheets(courseId ?? '');
  const notify = useNotifications();

  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetName, setSheetName] = useState('');
  const [columnsMappingJson, setColumnsMappingJson] = useState('');

  // Hydrate fields from server when data loads.
  useEffect(() => {
    if (link.data) {
      setSpreadsheetId(link.data.spreadsheet_id ?? '');
      setSheetName(link.data.sheet_name ?? '');
      if (link.data.columns_mapping) {
        setColumnsMappingJson(
          JSON.stringify(link.data.columns_mapping, null, 2),
        );
      }
    }
  }, [link.data]);

  const handleSave = () => {
    if (!courseId) return;
    let columns_mapping: Record<string, string> | undefined;
    if (columnsMappingJson.trim()) {
      try {
        columns_mapping = JSON.parse(columnsMappingJson);
      } catch {
        notify.error('Неверный JSON в mapping');
        return;
      }
    }
    set.mutate(
      { spreadsheet_id: spreadsheetId, sheet_name: sheetName, columns_mapping },
      {
        onSuccess: () => notify.success('Связь сохранена.'),
        onError: (p) =>
          notify.error((p as unknown as Problem).title || 'Не удалось сохранить'),
      },
    );
  };

  const handleSync = () => {
    sync.mutate(undefined, {
      onSuccess: () => notify.success('Синхронизация запущена.'),
      onError: (p) =>
        notify.error((p as unknown as Problem).title || 'Не удалось запустить'),
    });
  };

  return (
    <Page width="regular">
      <PageHeader title="Google Sheets" />

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="spreadsheet-id">Spreadsheet ID</Label>
            <Input
              id="spreadsheet-id"
              placeholder="1abc...xyz"
              value={spreadsheetId}
              onChange={(e) => setSpreadsheetId(e.currentTarget.value)}
              data-testid="spreadsheet-id"
            />
            <p className="text-xs text-muted-foreground">
              ID электронной таблицы (берётся из URL)
            </p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="sheet-name">Лист</Label>
            <Input
              id="sheet-name"
              placeholder="Sheet1"
              value={sheetName}
              onChange={(e) => setSheetName(e.currentTarget.value)}
              data-testid="sheet-name"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="columns-mapping">Columns mapping (JSON)</Label>
            <Textarea
              id="columns-mapping"
              rows={4}
              value={columnsMappingJson}
              onChange={(e) => setColumnsMappingJson(e.currentTarget.value)}
              data-testid="columns-mapping"
            />
            <p className="text-xs text-muted-foreground">
              Пример: {'{"author":"A","score":"B"}'}
            </p>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={set.isPending || !courseId}
            >
              {set.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Сохранить
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-2">
          <h5 className="text-base font-medium">Синхронизация</h5>
          {lastSync.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <p className="text-sm text-muted-foreground">
              Последняя:{' '}
              {lastSync.data?.last_sync_at
                ? dayjs(lastSync.data.last_sync_at).format('DD.MM.YYYY HH:mm')
                : '—'}{' '}
              · {lastSync.data?.status ?? 'нет данных'}
            </p>
          )}
          {link.data?.spreadsheet_id && (
            <a
              href={`https://docs.google.com/spreadsheets/d/${link.data.spreadsheet_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary hover:underline"
            >
              Открыть таблицу в Google Sheets
            </a>
          )}
          <div className="flex justify-end">
            <Button
              onClick={handleSync}
              disabled={
                sync.isPending || !courseId || !link.data?.spreadsheet_id
              }
              data-testid="manual-sync-btn"
            >
              {sync.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Синхронизировать сейчас
            </Button>
          </div>
        </CardContent>
      </Card>
    </Page>
  );
}
