/**
 * Course selector — fetches courses visible to the user via /v1/courses.
 *
 * Shadcn Select-based; supports value/onChange and disabled/placeholder.
 * (Searchable variant moved to a future Combobox iteration.)
 */
import { useQuery } from '@tanstack/react-query';
import { coursesApi, type CourseBrief } from '@/api/endpoints/courses';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/components/ui/utils';

export interface CourseSelectProps {
  value?: string | null;
  onChange?: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Backwards-compat: callers used to pass `style` for inline width. */
  style?: React.CSSProperties;
  'data-testid'?: string;
}

export function CourseSelect({
  value,
  onChange,
  placeholder = 'Выберите курс',
  disabled,
  className,
  style,
  ...rest
}: CourseSelectProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['courses', { limit: 200 }],
    queryFn: () => coursesApi.list({ limit: 200 }),
  });

  const items = (data?.data ?? []) as CourseBrief[];

  return (
    <Select
      value={value ?? undefined}
      onValueChange={(v) => onChange?.(v || null)}
      disabled={disabled || isLoading}
    >
      <SelectTrigger
        className={cn('w-full', className)}
        style={style}
        data-testid={rest['data-testid']}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {items.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            {isLoading ? 'Загрузка…' : 'Ничего не найдено'}
          </div>
        ) : (
          items.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))
        )}
      </SelectContent>
    </Select>
  );
}
