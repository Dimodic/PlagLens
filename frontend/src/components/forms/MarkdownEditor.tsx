/**
 * Minimal Markdown editor — Tabs with edit (Textarea, monospace) and preview (rendered text).
 * Full Tiptap integration deferred to later milestone.
 */
import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/components/ui/utils';

interface MarkdownEditorProps {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  placeholder?: string;
  minRows?: number;
  error?: string;
}

/**
 * Extremely simple "preview": preserves whitespace; bolds/italics not rendered as HTML
 * to keep this dependency-free. Replace with a real markdown renderer later.
 */
function naivePreview(md: string): string {
  return md;
}

export function MarkdownEditor({
  value,
  onChange,
  label,
  placeholder,
  minRows = 6,
  error,
}: MarkdownEditorProps) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      {label && <Label htmlFor={id}>{label}</Label>}
      <Tabs defaultValue="edit">
        <TabsList>
          <TabsTrigger value="edit">Редактировать</TabsTrigger>
          <TabsTrigger value="preview">Превью</TabsTrigger>
        </TabsList>
        <TabsContent value="edit" className="pt-2">
          <Textarea
            id={id}
            placeholder={placeholder ?? 'Markdown…'}
            rows={minRows}
            value={value}
            onChange={(e) => onChange(e.currentTarget.value)}
            className={cn(
              'font-mono text-[13px]',
              error && 'border-destructive focus-visible:ring-destructive/20',
            )}
            aria-invalid={!!error}
          />
          {error && (
            <p className="mt-1 text-sm text-destructive">{error}</p>
          )}
        </TabsContent>
        <TabsContent value="preview" className="pt-2">
          <div
            className="min-h-[120px] rounded-md border border-border bg-card p-3 text-sm whitespace-pre-wrap"
          >
            {naivePreview(value || '_Пусто_')}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
