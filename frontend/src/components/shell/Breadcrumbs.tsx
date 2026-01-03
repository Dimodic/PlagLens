import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem as BreadcrumbItemUI,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useBreadcrumbs, type BreadcrumbItem } from '@/hooks/useBreadcrumbs';

// 4 fits the deepest chain we render today — Курсы → Курс → ДЗ → Задание.
// Anything beyond collapses into a `…` popover so the top bar never wraps.
const MAX_VISIBLE = 4;

interface BreadcrumbsProps {
  fallbackTitle?: string;
}

export function Breadcrumbs({ fallbackTitle }: BreadcrumbsProps) {
  const items = useBreadcrumbs();
  const [popoverOpen, setPopoverOpen] = useState(false);

  if (items.length === 0) {
    return (
      <span data-testid="topbar-title" className="text-sm font-medium text-foreground">
        {fallbackTitle ?? ''}
      </span>
    );
  }

  const renderCrumb = (it: BreadcrumbItem, isLast: boolean) => (
    <BreadcrumbItemUI>
      {isLast || !it.to ? (
        // Down-weight the current-page crumb. shadcn's default
        // BreadcrumbPage uses text-foreground, which makes it visually
        // identical to the h1 right below — looks like a duplicated
        // heading. Push it to muted so it reads as navigation context.
        <BreadcrumbPage
          data-testid={isLast ? 'breadcrumbs-current' : undefined}
          className="text-muted-foreground"
        >
          {it.label}
        </BreadcrumbPage>
      ) : (
        <BreadcrumbLink asChild>
          <Link to={it.to} data-testid="breadcrumbs-link">
            {it.label}
          </Link>
        </BreadcrumbLink>
      )}
    </BreadcrumbItemUI>
  );

  if (items.length <= MAX_VISIBLE) {
    return (
      <Breadcrumb data-testid="breadcrumbs">
        <BreadcrumbList>
          {items.flatMap((it, i) => {
            const isLast = i === items.length - 1;
            const els = [<span key={`c-${i}`}>{renderCrumb(it, isLast)}</span>];
            if (!isLast) els.push(<BreadcrumbSeparator key={`s-${i}`} />);
            return els;
          })}
        </BreadcrumbList>
        <span data-testid="topbar-title" className="sr-only" aria-hidden="true">
          {items[items.length - 1].label}
        </span>
      </Breadcrumb>
    );
  }

  const first = items[0];
  const middle = items.slice(1, -2);
  const lastTwo = items.slice(-2);

  return (
    <Breadcrumb data-testid="breadcrumbs">
      <BreadcrumbList>
        {renderCrumb(first, false)}
        <BreadcrumbSeparator />
        <BreadcrumbItemUI>
          <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
            <PopoverTrigger
              data-testid="breadcrumbs-overflow"
              className="text-muted-foreground hover:text-foreground"
              aria-label="Развернуть"
            >
              …
            </PopoverTrigger>
            <PopoverContent align="start" className="p-1 w-56">
              <ul className="space-y-0.5">
                {middle.map((it, i) => (
                  <li key={i}>
                    {it.to ? (
                      <Link
                        to={it.to}
                        onClick={() => setPopoverOpen(false)}
                        data-testid="breadcrumbs-link"
                        className="block rounded px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        {it.label}
                      </Link>
                    ) : (
                      <span className="block px-2 py-1.5 text-sm text-muted-foreground">
                        {it.label}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        </BreadcrumbItemUI>
        <BreadcrumbSeparator />
        {lastTwo.flatMap((it, i) => {
          const isLast = i === lastTwo.length - 1;
          const els = [<span key={`l-${i}`}>{renderCrumb(it, isLast)}</span>];
          if (!isLast) els.push(<BreadcrumbSeparator key={`ls-${i}`} />);
          return els;
        })}
      </BreadcrumbList>
      <span data-testid="topbar-title" className="sr-only" aria-hidden="true">
        {items[items.length - 1].label}
      </span>
    </Breadcrumb>
  );
}
