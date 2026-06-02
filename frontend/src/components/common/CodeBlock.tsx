/**
 * Plain code block with optional copy button.
 *
 * Note: this used to wrap @mantine/code-highlight. Until a syntax highlighter
 * is wired in, this renders monospace text inside a styled container. The
 * `language` prop is preserved for forward-compatibility (added to data attr).
 */
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/utils';
import { useTranslation } from '@/i18n';

interface CodeBlockProps {
  code: string;
  language?: string;
  withCopyButton?: boolean;
  maxHeight?: number;
}

export function CodeBlock({
  code,
  language = 'plaintext',
  withCopyButton = true,
  maxHeight,
}: CodeBlockProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard not available */
    }
  };

  return (
    <div className="relative group rounded-md border border-border bg-muted/40">
      {withCopyButton && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={copied ? t('code_block.copied') : t('code_block.copy')}
          onClick={onCopy}
          className="absolute right-1.5 top-1.5 size-7 opacity-70 transition-opacity hover:opacity-100"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      )}
      <pre
        data-language={language}
        className={cn(
          'overflow-auto p-3 text-xs leading-relaxed',
          'font-mono whitespace-pre',
        )}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
