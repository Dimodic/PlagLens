/**
 * Editor for an AI Prompt Version.
 *
 * Three sections: system prompt, user template, JSON schema (read-only preview).
 * Toggleable read-only mode shows the prompt as code blocks.
 */
import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { PromptVersion } from '@/api/endpoints/ai';

interface PromptEditorProps {
  value: Pick<PromptVersion, 'system_prompt' | 'user_template' | 'json_schema'>;
  readOnly?: boolean;
  onChange?: (
    next: Pick<PromptVersion, 'system_prompt' | 'user_template' | 'json_schema'>,
  ) => void;
}

interface CodePreviewProps {
  code: string;
  maxHeight?: number;
}

function CodePreview({ code, maxHeight }: CodePreviewProps) {
  return (
    <pre
      className="rounded-md border bg-muted p-3 text-xs font-mono overflow-auto whitespace-pre-wrap"
      style={maxHeight ? { maxHeight } : undefined}
    >
      {code}
    </pre>
  );
}

export function PromptEditor({ value, readOnly = false, onChange }: PromptEditorProps) {
  const [systemPrompt, setSystemPrompt] = useState(value.system_prompt ?? '');
  const [userTemplate, setUserTemplate] = useState(value.user_template ?? '');

  useEffect(() => {
    setSystemPrompt(value.system_prompt ?? '');
    setUserTemplate(value.user_template ?? '');
  }, [value.system_prompt, value.user_template]);

  const update = (next: Partial<{ system_prompt: string; user_template: string }>) => {
    if (!onChange) return;
    onChange({
      system_prompt: next.system_prompt ?? systemPrompt,
      user_template: next.user_template ?? userTemplate,
      json_schema: value.json_schema,
    });
  };

  return (
    <Tabs defaultValue="system">
      <TabsList>
        <TabsTrigger value="system">System prompt</TabsTrigger>
        <TabsTrigger value="user">User template</TabsTrigger>
        <TabsTrigger value="schema">JSON schema</TabsTrigger>
      </TabsList>

      <TabsContent value="system" className="pt-3">
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Передаётся как `role: system`. Поддерживается переменная `{'{code}'}` (заворачивается в `&lt;student_code&gt;`).
          </p>
          {readOnly ? (
            <CodePreview code={systemPrompt} maxHeight={420} />
          ) : (
            <Textarea
              rows={12}
              className="font-mono"
              value={systemPrompt}
              onChange={(e) => {
                setSystemPrompt(e.currentTarget.value);
                update({ system_prompt: e.currentTarget.value });
              }}
            />
          )}
        </div>
      </TabsContent>

      <TabsContent value="user" className="pt-3">
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Доступны переменные:{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              {'{course_name}'}
            </code>
            ,{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              {'{assignment_title}'}
            </code>
            ,{' '}
            <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
              {'{language}'}
            </code>
            .
          </p>
          {readOnly ? (
            <CodePreview code={userTemplate} maxHeight={300} />
          ) : (
            <Textarea
              rows={8}
              className="font-mono"
              value={userTemplate}
              onChange={(e) => {
                setUserTemplate(e.currentTarget.value);
                update({ user_template: e.currentTarget.value });
              }}
            />
          )}
        </div>
      </TabsContent>

      <TabsContent value="schema" className="pt-3">
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            JSON-Schema для structured output. Доступно только для чтения — определяется кодом.
          </p>
          <CodePreview
            code={JSON.stringify(value.json_schema ?? {}, null, 2)}
            maxHeight={420}
          />
        </div>
      </TabsContent>
    </Tabs>
  );
}

export default PromptEditor;
