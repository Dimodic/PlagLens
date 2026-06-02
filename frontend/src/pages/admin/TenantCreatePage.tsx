/**
 * /admin/tenants/new — admin creates a new institution.
 *
 * Single-field minimal form. We used to expose ``Domain`` and
 * ``CORS origins`` here too, but they confused the admins more than they
 * helped — the slug is auto-derived from the name on the backend, the
 * domain is a vanity field nobody actually used, and CORS origins
 * leaked an implementation detail of the gateway's network policy. If
 * either ever becomes necessary they can be set later from the tenant
 * detail page (which has the full editor for the admin use case).
 */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Page, PageHeader } from '@/components/layout/Page';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { useCreateTenant } from '@/hooks/api/useTenants';
import { useTranslation } from '@/i18n';
import type { Problem } from '@/api/types';

export function TenantCreatePage() {
  const { t } = useTranslation();
  useDocumentTitle(t('tenant_create.title'));
  const navigate = useNavigate();
  const notify = useNotifications();
  const create = useCreateTenant();

  const [name, setName] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);

  const handleSubmit = async () => {
    setProblem(null);
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const result = await create.mutateAsync({ name: trimmed });
      notify.success(t('tenant_create.created', { name: result.name }));
      navigate(`/admin/tenants/${result.id}`);
    } catch (e) {
      setProblem(e as Problem);
    }
  };

  return (
    <Page width="narrow">
      <Link
        to="/admin/tenants"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← {t('tenant_create.back')}
      </Link>
      <PageHeader title={t('tenant_create.title')} />

      {problem && <ProblemAlert problem={problem} />}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="tenant-name">{t('tenant_create.name_label')}</Label>
          <Input
            id="tenant-name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder={t('tenant_create.name_placeholder')}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleSubmit();
            }}
            data-testid="tenant-create-name"
          />
          <p className="text-xs text-muted-foreground">
            {t('tenant_create.name_hint')}
          </p>
        </div>

        <div className="pt-2">
          <Button
            onClick={handleSubmit}
            disabled={create.isPending || !name.trim()}
            data-testid="tenant-create-submit"
          >
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.create')}
          </Button>
        </div>
      </div>
    </Page>
  );
}

export default TenantCreatePage;
