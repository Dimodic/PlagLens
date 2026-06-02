/**
 * PreferencesMatrix — per-event × per-channel preference checkbox grid.
 */
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useTranslation } from '@/i18n';
import type {
  AvailableEvent,
  PerEventPreferences,
} from '@/api/endpoints/notifications';

export interface PreferencesMatrixProps {
  events: AvailableEvent[];
  value: PerEventPreferences;
  onChange: (next: PerEventPreferences) => void;
}

const CHANNELS: { key: 'inapp' | 'email' | 'telegram'; label: string }[] = [
  { key: 'inapp', label: 'In-app' },
  { key: 'email', label: 'Email' },
  { key: 'telegram', label: 'Telegram' },
];

export function PreferencesMatrix({
  events,
  value,
  onChange,
}: PreferencesMatrixProps) {
  const { t } = useTranslation();
  const toggle = (
    eventType: string,
    channel: 'inapp' | 'email' | 'telegram',
  ) => {
    const current = value[eventType] ?? {
      inapp: true,
      email: true,
      telegram: false,
    };
    onChange({
      ...value,
      [eventType]: { ...current, [channel]: !current[channel] },
    });
  };

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('preferences_matrix.empty')}
      </p>
    );
  }

  return (
    <Table data-testid="preferences-matrix">
      <TableHeader>
        <TableRow>
          <TableHead>{t('preferences_matrix.col_event')}</TableHead>
          {CHANNELS.map((c) => (
            <TableHead key={c.key} className="w-[100px] text-center">
              {c.label}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {events.map((ev) => {
          const row = value[ev.event_type] ?? {
            inapp: true,
            email: true,
            telegram: false,
          };
          return (
            <TableRow
              key={ev.event_type}
              data-testid={`pref-row-${ev.event_type}`}
            >
              <TableCell>
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{ev.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {ev.description}
                  </span>
                </div>
              </TableCell>
              {CHANNELS.map((c) => (
                <TableCell key={c.key} className="text-center">
                  <Checkbox
                    checked={!!row[c.key]}
                    onCheckedChange={() => toggle(ev.event_type, c.key)}
                    aria-label={`${ev.title} ${c.label}`}
                    data-testid={`pref-${ev.event_type}-${c.key}`}
                  />
                </TableCell>
              ))}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
