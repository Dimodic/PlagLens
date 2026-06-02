/**
 * ExpandableSearch — a compact magnifier that expands to an input in place.
 *
 * The same quiet pattern used in the Courses list header: collapsed it's just
 * a ghost lupa icon (w-9); clicking expands the width (→ 240px) and reveals a
 * rounded input. Escape or the ✕ collapses it and clears the query. Keeps
 * toolbars light instead of a permanent full-width search box.
 *
 *   <ExpandableSearch value={q} onChange={setQ} placeholder="Поиск" />
 */
import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/components/ui/utils';
import { useTranslation } from '@/i18n';

interface ExpandableSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Tailwind width class when expanded. Default w-[240px]. */
  expandedClassName?: string;
  className?: string;
  'data-testid'?: string;
}

export function ExpandableSearch({
  value,
  onChange,
  placeholder,
  expandedClassName = 'w-[240px]',
  className,
  ...rest
}: ExpandableSearchProps) {
  const { t } = useTranslation();
  const placeholderText = placeholder ?? t('expandable_search.placeholder');
  // Start expanded if a query is already set (e.g. restored from URL state).
  const [open, setOpen] = useState(!!value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const close = () => {
    onChange('');
    setOpen(false);
  };

  return (
    <div
      data-testid={rest['data-testid']}
      className={cn(
        'relative shrink-0 overflow-hidden transition-[width] duration-200 ease-out',
        open ? expandedClassName : 'w-9',
        className,
      )}
    >
      {open ? (
        <>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={value}
            onChange={(e) => onChange(e.currentTarget.value)}
            placeholder={placeholderText}
            aria-label={placeholderText}
            className="h-9 rounded-full pl-9 pr-9 focus-visible:border-foreground/30 focus-visible:ring-0 focus-visible:ring-offset-0"
            onKeyDown={(e) => {
              if (e.key === 'Escape') close();
            }}
          />
          <button
            type="button"
            onClick={close}
            aria-label={t('expandable_search.close')}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setOpen(true)}
          aria-label={placeholderText}
        >
          <Search className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export default ExpandableSearch;
