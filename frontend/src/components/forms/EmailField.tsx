import { forwardRef, useId } from 'react';
import { Mail } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/components/ui/utils';

export interface EmailFieldProps
  extends Omit<React.ComponentProps<'input'>, 'type'> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  /** Wrapper className (the outer <div>). */
  wrapperClassName?: string;
}

export const EmailField = forwardRef<HTMLInputElement, EmailFieldProps>(
  function EmailField(
    {
      label,
      description,
      error,
      id,
      className,
      wrapperClassName,
      placeholder = 'you@example.com',
      autoComplete = 'email',
      ...props
    },
    ref,
  ) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    return (
      <div className={cn('space-y-1.5', wrapperClassName)}>
        {label && <Label htmlFor={inputId}>{label}</Label>}
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={ref}
            id={inputId}
            type="email"
            autoComplete={autoComplete}
            placeholder={placeholder}
            className={cn('pl-9', className)}
            aria-invalid={!!error}
            {...props}
          />
        </div>
        {description && !error && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  },
);
EmailField.displayName = 'EmailField';
