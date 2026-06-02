/**
 * FilterCombo — outline-button + Popover/Command search combobox used for
 * the course / ДЗ / task filter cascade. Shared by the «Все посылки»
 * triage (SubmissionsListPage) and the assistant cabinet
 * (GradingQueuePage) so all filter rows read as one consistent control
 * bar instead of a styled-button-next-to-a-raw-<select> mismatch.
 *
 * ``value === ''`` means the "all" sentinel option is selected.
 */
import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { cn } from '@/components/ui/utils';
import { useTranslation } from '@/i18n';

export interface FilterComboOption {
  value: string;
  label: string;
}

export function FilterCombo({
  value,
  onChange,
  options,
  allLabel,
  searchPlaceholder,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  options: FilterComboOption[];
  allLabel: string;
  searchPlaceholder?: string;
  testId?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 min-w-[220px] justify-between"
          data-testid={testId}
        >
          <span className="truncate">
            {value === '' ? allLabel : selected?.label ?? allLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] p-0">
        <Command>
          <CommandInput
            placeholder={searchPlaceholder ?? t('filter_combo.search_placeholder')}
          />
          <CommandList>
            <CommandEmpty>{t('filter_combo.empty')}</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value={allLabel}
                onSelect={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    value === '' ? 'opacity-100' : 'opacity-0',
                  )}
                />
                {allLabel}
              </CommandItem>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.label}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      value === o.value ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{o.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default FilterCombo;
