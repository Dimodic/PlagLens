/**
 * HomeworkMultiSelect — popover + checkbox list for picking multiple ДЗ.
 *
 * The export page used to pick a single homework via a regular Select; now
 * the teacher can fold *several* into one export (per the user's request:
 * "надо сделать возможность выгрузить сразу несколько ДЗ"). Trigger is a
 * shadcn-Button styled like a form Select so the row reads naturally next
 * to the course Select that's still single-pick.
 */
import { useMemo, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/components/ui/utils';

export interface HomeworkOption {
  id: string;
  title: string;
}

interface HomeworkMultiSelectProps {
  options: HomeworkOption[];
  value: string[];
  onChange: (next: string[]) => void;
  /** Empty-state label inside the trigger when nothing is picked. */
  placeholder?: string;
  /** Disabled when no course is selected etc. */
  disabled?: boolean;
  loading?: boolean;
  /** ``data-testid`` for the trigger button. */
  testId?: string;
}

export function HomeworkMultiSelect({
  options,
  value,
  onChange,
  placeholder = 'Выберите ДЗ',
  disabled,
  loading,
  testId,
}: HomeworkMultiSelectProps) {
  const [open, setOpen] = useState(false);

  const valueSet = useMemo(() => new Set(value), [value]);

  const triggerLabel = (() => {
    if (loading) return 'Загрузка…';
    if (disabled && options.length === 0) return placeholder;
    if (value.length === 0) return placeholder;
    if (value.length === 1) {
      const it = options.find((o) => o.id === value[0]);
      return it?.title ?? `1 ДЗ`;
    }
    if (value.length === options.length) return 'Все ДЗ';
    return `Выбрано ДЗ: ${value.length}`;
  })();

  const toggle = (id: string) => {
    const next = valueSet.has(id)
      ? value.filter((x) => x !== id)
      : [...value, id];
    onChange(next);
  };

  const selectAll = () => onChange(options.map((o) => o.id));
  const clear = () => onChange([]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          data-testid={testId}
          className={cn(
            'w-full justify-between font-normal',
            value.length === 0 && 'text-muted-foreground',
          )}
        >
          <span className="truncate text-left">{triggerLabel}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[--radix-popover-trigger-width] p-0"
        align="start"
      >
        {options.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            В этом курсе нет ДЗ
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-border/60 px-2 py-1.5 text-xs">
              <button
                type="button"
                className="rounded px-2 py-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                onClick={selectAll}
              >
                Все
              </button>
              <button
                type="button"
                className="rounded px-2 py-1 text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                onClick={clear}
              >
                Очистить
              </button>
            </div>
            <ul className="max-h-72 overflow-auto py-1">
              {options.map((o) => {
                const checked = valueSet.has(o.id);
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => toggle(o.id)}
                      data-testid={`homework-option-${o.id}`}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                        checked
                          ? 'bg-muted/60'
                          : 'text-foreground hover:bg-muted/40',
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        tabIndex={-1}
                        className="pointer-events-none"
                      />
                      <span className="flex-1 truncate">{o.title}</span>
                      {checked && (
                        <Check className="h-3.5 w-3.5 text-primary" />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default HomeworkMultiSelect;
