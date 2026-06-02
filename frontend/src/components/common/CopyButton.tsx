/**
 * CopyButton — a ghost icon button that copies ``value`` to the clipboard and
 * gives immediate visual feedback: the copy icon swaps to a green check for a
 * moment. Used wherever a short token (tenant id, invitation code) is shown.
 */
import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/i18n';

interface Props {
  value: string;
  /** aria-label / tooltip. Defaults to «Скопировать». */
  label?: string;
  /** Optional success toast text (e.g. «Код … скопирован»). */
  toastMessage?: string;
  className?: string;
}

export function CopyButton({ value, label, toastMessage, className }: Props) {
  const { t } = useTranslation();
  const notify = useNotifications();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (toastMessage) notify.success(toastMessage);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      notify.error(t('common.copy_failed'));
    }
  };

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      onClick={onCopy}
      aria-label={label ?? t('common.copy')}
      title={label ?? t('common.copy')}
      className={className}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-emerald-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

export default CopyButton;
