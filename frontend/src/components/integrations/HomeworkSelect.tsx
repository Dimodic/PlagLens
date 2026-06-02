/**
 * HomeworkSelect — a searchable ДЗ picker (combobox in a popover).
 *
 * A course can have many homeworks, so an always-expanded checkbox list
 * gets unwieldy. This collapses the choice into a dropdown with a search
 * box — the same ergonomics as the course <Select>, but it supports both
 * single-pick (manual upload → one ДЗ) and multi-pick (autosync /
 * scoped sync → several ДЗ).
 */
import { useState } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';
import { useHomeworksForCourse } from '@/hooks/api/useHomeworks';
import { useTranslation } from '@/i18n';
import { cn } from '@/components/ui/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';

type Base = {
  courseId: string | undefined;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  testId?: string;
};

type Props =
  | (Base & {
      multiple?: false;
      value: string;
      onChange: (value: string) => void;
    })
  | (Base & {
      multiple: true;
      value: string[];
      /** Label shown when nothing is picked (e.g. «Все ДЗ»). */
      allLabel?: string;
      onChange: (value: string[]) => void;
    });

export function HomeworkSelect(props: Props) {
  const { t } = useTranslation();
  const {
    courseId,
    placeholder = t('homework_select.placeholder'),
    disabled,
    className,
    testId,
  } = props;
  const [open, setOpen] = useState(false);
  const q = useHomeworksForCourse(courseId, { limit: 200 });
  const homeworks = q.data?.data ?? [];

  const titleOf = (id: string) =>
    homeworks.find((h) => String(h.id) === id)?.title ?? id;

  const nothingPicked = props.multiple
    ? props.value.length === 0
    : !props.value;

  let label: string;
  if (props.multiple) {
    label =
      props.value.length === 0
        ? (props.allLabel ?? placeholder)
        : props.value.length === 1
          ? titleOf(props.value[0])
          : t('homework_select.selected_count', { count: props.value.length });
  } else {
    label = props.value ? titleOf(props.value) : placeholder;
  }

  const isOn = (id: string) =>
    props.multiple ? props.value.includes(id) : props.value === id;

  const toggle = (id: string) => {
    if (props.multiple) {
      const set = new Set(props.value);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      props.onChange([...set]);
    } else {
      props.onChange(props.value === id ? '' : id);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* Styled to match <SelectTrigger> (the «Курс» field) so the two
            form controls read as a pair, not a select + a pill button. */}
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || !courseId}
          data-testid={testId}
          className={cn(
            'border-input bg-input-background dark:bg-input/30 dark:hover:bg-input/50 flex h-9 w-full max-w-sm items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm whitespace-nowrap transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span className={cn('truncate', nothingPicked && 'text-muted-foreground')}>
            {label}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="p-0"
        style={{ width: 'var(--radix-popover-trigger-width)' }}
      >
        <Command>
          <CommandInput placeholder={t('homework_select.search_placeholder')} />
          <CommandList>
            {q.isLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <CommandEmpty>{t('homework_select.empty')}</CommandEmpty>
                <CommandGroup>
                  {homeworks.map((hw) => {
                    const id = String(hw.id);
                    return (
                      <CommandItem
                        key={id}
                        value={`${hw.title} ${id}`}
                        onSelect={() => toggle(id)}
                        data-testid={`hw-option-${id}`}
                      >
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4 shrink-0',
                            isOn(id) ? 'opacity-100' : 'opacity-0',
                          )}
                        />
                        <span className="truncate">{hw.title}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default HomeworkSelect;
