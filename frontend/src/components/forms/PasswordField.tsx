import { forwardRef, useId, useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/components/ui/utils';
import { useTranslation } from '@/i18n';

export interface PasswordFieldProps
  extends Omit<React.ComponentProps<'input'>, 'type'> {
  label?: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  /** Wrapper className (the outer <div>). */
  wrapperClassName?: string;
  /** Show "reveal password" button. */
  withReveal?: boolean;
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField(
    {
      label,
      description,
      error,
      id,
      className,
      wrapperClassName,
      autoComplete = 'current-password',
      withReveal = true,
      ...props
    },
    ref,
  ) {
    const { t } = useTranslation();
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const [visible, setVisible] = useState(false);
    return (
      <div className={cn('space-y-1.5', wrapperClassName)}>
        {label && <Label htmlFor={inputId}>{label}</Label>}
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={ref}
            id={inputId}
            type={visible ? 'text' : 'password'}
            autoComplete={autoComplete}
            className={cn('pl-9', withReveal && 'pr-9', className)}
            aria-invalid={!!error}
            {...props}
          />
          {withReveal && (
            <button
              type="button"
              tabIndex={-1}
              aria-label={
                visible
                  ? t('password_field.hide')
                  : t('password_field.show')
              }
              onClick={() => setVisible((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              {visible ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
        {description && !error && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  },
);
PasswordField.displayName = 'PasswordField';
