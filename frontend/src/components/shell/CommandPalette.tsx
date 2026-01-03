import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  FileText,
  Search as SearchIcon,
  User as UserIcon,
} from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useTranslation } from '@/i18n';
import { useGlobalSearch } from '@/hooks/api/useSearch';
import type { SearchGroup, SearchType } from '@/api/endpoints/search';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

const TYPE_ORDER: SearchType[] = ['course', 'assignment', 'user'];

function typeIcon(type: SearchType) {
  if (type === 'course') return <BookOpen className="h-4 w-4 text-muted-foreground" />;
  if (type === 'assignment') return <FileText className="h-4 w-4 text-muted-foreground" />;
  return <UserIcon className="h-4 w-4 text-muted-foreground" />;
}

function typeLabel(type: SearchType, t: (k: string) => string): string {
  const k =
    type === 'course' ? 'cmdk.group.courses'
    : type === 'assignment' ? 'cmdk.group.assignments'
    : 'cmdk.group.users';
  return t(k);
}

function buildHref(type: SearchType, id: string): string {
  if (type === 'course') return `/courses/${id}`;
  if (type === 'assignment') return `/assignments/${id}`;
  return `/admin/users?focus=${id}`;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const { data, isLoading } = useGlobalSearch(query, { enabled: open && query.trim().length >= 2 });

  const groups: SearchGroup[] = useMemo(() => {
    const list = (data?.groups ?? []) as SearchGroup[];
    return [...list].sort(
      (a, b) => TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type),
    );
  }, [data]);

  const onPick = useCallback(
    (type: SearchType, id: string) => {
      navigate(buildHref(type, id));
      onClose();
    },
    [navigate, onClose],
  );

  const onOpenChange = (next: boolean) => {
    if (!next) onClose();
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder={t('shell.search_placeholder')}
        value={query}
        onValueChange={setQuery}
        data-testid="cmdk-input"
      />
      <CommandList>
        {query.trim().length < 2 ? (
          <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
            <SearchIcon className="h-4 w-4" />
            {t('cmdk.hint')}
          </div>
        ) : isLoading ? (
          <div className="px-4 py-6 text-sm text-muted-foreground">
            {t('cmdk.loading')}
          </div>
        ) : groups.length === 0 ? (
          <CommandEmpty>{t('cmdk.no_results')}</CommandEmpty>
        ) : (
          groups.map((g) => (
            <CommandGroup key={g.type} heading={typeLabel(g.type, t)}>
              {g.items.map((r) => {
                const subtitle = r.email ?? r.slug ?? '';
                return (
                  <CommandItem
                    key={`${g.type}-${r.id}`}
                    value={`${r.title} ${subtitle}`}
                    onSelect={() => onPick(g.type, r.id)}
                    className="gap-3"
                  >
                    {typeIcon(g.type)}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{r.title}</div>
                      {subtitle && (
                        <div className="truncate text-xs text-muted-foreground">
                          {subtitle}
                        </div>
                      )}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          ))
        )}
      </CommandList>
    </CommandDialog>
  );
}
