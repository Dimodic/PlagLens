/**
 * AiProviderPanel — the "ИИ" item in course Integrations.
 *
 * A teacher/assistant connects their OWN LLM provider + key here. It powers
 * AI-analysis on their courses (by them and their assistants). The key is the
 * person's own and visible only to them. One connected provider is active.
 *
 * Design: flat, no card chrome — sections split by a hairline, never boxes.
 *
 * Model is picked from the provider's live catalogue (searchable). Each
 * connected provider can carry a custom system prompt; empty = the standard
 * one, which already returns the structured JSON PlagLens parses into
 * per-line comments — so a custom prompt should keep that JSON contract.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronsUpDown,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { aiApi, type MyAiModel, type MyAiProvider } from '@/api/endpoints/ai';
import {
  useActivateMyAiProvider,
  useCreateMyAiProvider,
  useDefaultAiPrompt,
  useDeleteMyAiProvider,
  useMyAiProviders,
  useUpdateMyAiProvider,
} from '@/hooks/api/useAi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { parseProblem } from '@/api/problem';
import { cn } from '@/components/ui/utils';
import { useTranslation } from '@/i18n';
import type { Problem } from '@/api/types';

const PROVIDERS: { value: string; label?: string }[] = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'openai', label: 'OpenAI' },
  // Any OpenAI-compatible endpoint by URL — so new providers/models work
  // without a code change (teacher pastes the base URL).
  { value: 'custom' }, // label via t('ai_provider.provider_custom')
];
const PROVIDER_LABEL: Record<string, string> = {
  openrouter: 'OpenRouter',
  openai: 'OpenAI',
};

/** Friendly provider label from a base URL host (for the connected-row meta). */
function hostFromUrl(u: string): string {
  try {
    return new URL(u.trim()).host;
  } catch {
    return '';
  }
}
/** Providers whose catalogue needs the key to list (OpenAI does; OpenRouter's
 *  /models is public). */
const NEEDS_KEY_TO_LIST = new Set(['openai']);
const MAX_MODEL_RESULTS = 50;

/* ------------------------------------------------------------------ */
/* Searchable model picker — own substring filter (cmdk's fuzzy match  */
/* over 300+ models was slow and surfaced near-misses), capped render. */

function ModelCombo({
  provider,
  apiKey,
  value,
  onChange,
}: {
  provider: string;
  apiKey: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [models, setModels] = useState<MyAiModel[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Catalogue depends on provider + key — drop the cache when either changes.
  useEffect(() => {
    setModels(null);
    setErr(null);
    setQuery('');
  }, [provider, apiKey]);

  const load = async () => {
    if (NEEDS_KEY_TO_LIST.has(provider) && !apiKey.trim()) {
      setErr(t('ai_provider.model_needs_key'));
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const list = await aiApi.myProviders.listModels({
        provider,
        api_key: apiKey.trim() || undefined,
      });
      setModels(list);
    } catch (e) {
      const p = parseProblem(e);
      setErr(p.detail || p.title || t('ai_provider.model_load_error'));
    } finally {
      setLoading(false);
    }
  };

  const onOpenChange = (o: boolean) => {
    setOpen(o);
    if (o && models === null && !err && !loading) void load();
  };

  const busy = loading || (models === null && !err);

  const { items, hidden } = useMemo(() => {
    const all = models ?? [];
    const q = query.trim().toLowerCase();
    const matches = !q
      ? all
      : all
          .filter(
            (m) =>
              m.id.toLowerCase().includes(q) ||
              m.name.toLowerCase().includes(q),
          )
          .sort((a, b) => {
            const ap = a.id.toLowerCase().startsWith(q) ? 0 : 1;
            const bp = b.id.toLowerCase().startsWith(q) ? 0 : 1;
            if (ap !== bp) return ap - bp;
            return a.id.localeCompare(b.id);
          });
    const top = matches.slice(0, MAX_MODEL_RESULTS);
    // "hidden" = matching models NOT rendered (cap), not every other model —
    // otherwise a 2-hit search wrongly reads "…ещё 341".
    return { items: top, hidden: matches.length - top.length };
  }, [models, query]);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-between font-normal"
          data-testid="ai-provider-model"
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {value || t('ai_provider.model_placeholder')}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] min-w-[260px] p-0"
      >
        <Command shouldFilter={false}>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t('ai_provider.model_search_placeholder')}
          />
          <CommandList className="max-h-[280px] p-1">
            {busy ? (
              <div className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('ai_provider.model_loading')}
              </div>
            ) : err ? (
              <div className="px-3 py-6 text-sm text-muted-foreground">{err}</div>
            ) : items.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t('ai_provider.model_empty')}
              </div>
            ) : (
              <CommandGroup>
                {items.map((m) => (
                  <CommandItem
                    key={m.id}
                    value={m.id}
                    onSelect={() => {
                      onChange(m.id);
                      setOpen(false);
                    }}
                    className="items-start gap-2 py-2"
                  >
                    <Check
                      className={cn(
                        'mt-0.5 h-4 w-4 shrink-0',
                        value === m.id ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span className="flex min-w-0 flex-col leading-tight">
                      <span className="truncate text-sm">{m.name}</span>
                      {m.name !== m.id && (
                        <span className="truncate text-xs text-muted-foreground">
                          {m.id}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                ))}
                {hidden > 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    {t('ai_provider.model_more', { count: hidden })}
                  </div>
                )}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* One connected provider: status + activate/delete + collapsible      */
/* custom-prompt editor.                                               */

function ProviderRow({
  p,
  defaultPrompt,
}: {
  p: MyAiProvider;
  defaultPrompt: string;
}) {
  const { t } = useTranslation();
  const activateMut = useActivateMyAiProvider();
  const deleteMut = useDeleteMyAiProvider();
  const updateMut = useUpdateMyAiProvider();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(p.system_prompt ?? '');
  // "сохранено" is a transient confirmation — show it briefly then fade,
  // instead of letting it stick (the mutation's isSuccess never resets).
  const [showSaved, setShowSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    [],
  );

  const dirty = draft.trim() !== (p.system_prompt ?? '').trim();
  const custom = !!(p.system_prompt ?? '').trim();

  const savePrompt = () => {
    updateMut.mutate(
      { id: p.id, body: { system_prompt: draft } },
      {
        onSuccess: () => {
          setShowSaved(true);
          if (savedTimer.current) clearTimeout(savedTimer.current);
          savedTimer.current = setTimeout(() => setShowSaved(false), 2200);
        },
      },
    );
  };

  return (
    <div className="py-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="group flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">
              {p.model}
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {t('ai_provider.row_meta', {
                provider: PROVIDER_LABEL[p.provider] ?? p.provider,
                kind: custom
                  ? t('ai_provider.prompt_kind_custom')
                  : t('ai_provider.prompt_kind_standard'),
              })}
              {p.has_key ? '' : t('ai_provider.row_no_key')}
            </span>
          </span>
        </button>
        {p.active ? (
          <span className="shrink-0 text-xs font-medium text-emerald-600 dark:text-emerald-400/80">
            {t('ai_provider.active')}
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={activateMut.isPending}
            onClick={() => activateMut.mutate(p.id)}
          >
            {t('ai_provider.make_active')}
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          disabled={deleteMut.isPending}
          onClick={() => deleteMut.mutate(p.id)}
          aria-label={t('ai_provider.delete')}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {open && (
        <div className="mt-3 space-y-2 border-l border-border/60 pl-3">
          <Textarea
            value={draft}
            onChange={(e) => {
              setDraft(e.currentTarget.value);
              setShowSaved(false);
            }}
            placeholder={t('ai_provider.prompt_placeholder')}
            rows={7}
            className="font-mono text-xs leading-relaxed"
            data-testid={`ai-prompt-${p.id}`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              disabled={!dirty || updateMut.isPending}
              onClick={savePrompt}
              data-testid={`ai-prompt-save-${p.id}`}
            >
              {updateMut.isPending && (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              )}
              {t('ai_provider.prompt_save')}
            </Button>
            {draft.trim() ? (
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => setDraft('')}
              >
                {t('ai_provider.prompt_reset')}
              </Button>
            ) : (
              defaultPrompt && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => setDraft(defaultPrompt)}
                >
                  {t('ai_provider.prompt_show_default')}
                </Button>
              )
            )}
            {showSaved && !dirty && (
              <span className="text-xs text-emerald-600 transition-opacity dark:text-emerald-400/80">
                {t('ai_provider.saved')}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('ai_provider.prompt_hint')}
          </p>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function AiProviderPanel() {
  const { t } = useTranslation();
  const { data, isLoading } = useMyAiProviders();
  const createMut = useCreateMyAiProvider();
  const { data: defaultPrompt } = useDefaultAiPrompt();

  const [provider, setProvider] = useState('openrouter');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);
  // With a provider already connected, the add form is hidden behind a
  // button — one connection is the common case, so we don't clutter.
  const [addOpen, setAddOpen] = useState(false);

  const list = data ?? [];

  const onConnect = async () => {
    setProblem(null);
    try {
      await createMut.mutateAsync({
        provider:
          provider === 'custom' ? hostFromUrl(baseUrl) || 'custom' : provider,
        model: model.trim(),
        api_key: apiKey.trim(),
        base_url: provider === 'custom' ? baseUrl.trim() : undefined,
        activate: true,
      });
      setApiKey('');
      setModel('');
      setBaseUrl('');
      setAddOpen(false);
    } catch (e) {
      setProblem(parseProblem(e));
    }
  };

  return (
    <div className="max-w-2xl space-y-5" data-testid="ai-provider-panel">
      <header className="flex items-center gap-2.5">
        <Sparkles className="h-6 w-6 shrink-0 text-muted-foreground" />
        <h2 className="text-xl font-semibold text-foreground">
          {t('ai_provider.title')}
        </h2>
      </header>
      <p className="max-w-md text-sm text-muted-foreground">
        {t('ai_provider.intro')}
      </p>

      {problem && <ProblemAlert problem={problem} />}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('ai_provider.loading')}
        </div>
      ) : list.length > 0 ? (
        <div className="space-y-0.5">
          {list.map((p) => (
            <ProviderRow
              key={p.id}
              p={p}
              defaultPrompt={defaultPrompt?.system_prompt ?? ''}
            />
          ))}
        </div>
      ) : null}

      {list.length > 0 && !addOpen ? (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          data-testid="ai-provider-add-toggle"
        >
          <Plus className="h-4 w-4" />
          {t('ai_provider.add')}
        </button>
      ) : (
        <div className="space-y-4">
          <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {list.length > 0
              ? t('ai_provider.add_more')
              : t('ai_provider.connect_section')}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              {t('ai_provider.field_provider')}
            </label>
            <Select
              value={provider}
              onValueChange={(v) => {
                setProvider(v);
                setModel('');
                setBaseUrl('');
              }}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label ?? t('ai_provider.provider_custom')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              {provider === 'custom'
                ? t('ai_provider.field_base_url')
                : t('ai_provider.field_model')}
            </label>
            {provider === 'custom' ? (
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.currentTarget.value)}
                placeholder={t('ai_provider.base_url_placeholder')}
                autoComplete="off"
                className="h-9"
                data-testid="ai-provider-base-url"
              />
            ) : (
              <ModelCombo
                provider={provider}
                apiKey={apiKey}
                value={model}
                onChange={setModel}
              />
            )}
          </div>
        </div>
        {provider === 'custom' && (
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">
              {t('ai_provider.field_model')}
            </label>
            <Input
              value={model}
              onChange={(e) => setModel(e.currentTarget.value)}
              placeholder={t('ai_provider.model_manual_placeholder')}
              autoComplete="off"
              className="h-9 max-w-md"
              data-testid="ai-provider-model-manual"
            />
            <p className="text-xs text-muted-foreground">
              {t('ai_provider.custom_hint')}
            </p>
          </div>
        )}
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">
            {t('ai_provider.field_key')}
          </label>
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.currentTarget.value)}
            placeholder="sk-…"
            autoComplete="off"
            className="max-w-md"
            data-testid="ai-provider-key"
          />
          <p className="text-xs text-muted-foreground">
            {t('ai_provider.key_hint')}
          </p>
        </div>
        <Button
          onClick={onConnect}
          disabled={
            !apiKey.trim() ||
            !model.trim() ||
            (provider === 'custom' && !baseUrl.trim()) ||
            createMut.isPending
          }
          data-testid="ai-provider-connect"
        >
          {createMut.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          {t('ai_provider.connect')}
        </Button>
        </div>
      )}
    </div>
  );
}

export default AiProviderPanel;
