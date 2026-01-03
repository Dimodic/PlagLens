/**
 * /admin/tenants/new — super_admin creates a new tenant.
 */
import { useState, KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusPill } from '@/components/common/StatusPill';
import { Page, PageHeader } from '@/components/layout/Page';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { useCreateTenant } from '@/hooks/api/useTenants';
import type { Problem } from '@/api/types';

export function TenantCreatePage() {
  useDocumentTitle('Новый тенант');
  const navigate = useNavigate();
  const notify = useNotifications();
  const create = useCreateTenant();

  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [corsOrigins, setCorsOrigins] = useState<string[]>([]);
  const [corsInput, setCorsInput] = useState('');
  const [problem, setProblem] = useState<Problem | null>(null);

  const addCorsOrigin = () => {
    const v = corsInput.trim();
    if (v && !corsOrigins.includes(v)) {
      setCorsOrigins([...corsOrigins, v]);
    }
    setCorsInput('');
  };

  const removeCorsOrigin = (i: number) => {
    setCorsOrigins(corsOrigins.filter((_, idx) => idx !== i));
  };

  const handleCorsKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addCorsOrigin();
    }
  };

  const handleSubmit = async () => {
    setProblem(null);
    try {
      const result = await create.mutateAsync({
        name: name.trim(),
        domain: domain.trim() || null,
        settings: { cors_origins: corsOrigins },
      });
      notify.success(`Тенант ${result.name} создан`);
      navigate(`/admin/tenants/${result.id}`);
    } catch (e) {
      setProblem(e as Problem);
    }
  };

  void navigate;
  return (
    <Page width="narrow">
      <Link
        to="/admin/tenants"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Тенанты
      </Link>
      <PageHeader title="Новый тенант" />

      {problem && <ProblemAlert problem={problem} />}

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="tenant-name">Название</Label>
          <Input
            id="tenant-name"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            data-testid="tenant-create-name"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tenant-domain">Домен</Label>
          <Input
            id="tenant-domain"
            value={domain}
            onChange={(e) => setDomain(e.currentTarget.value)}
            data-testid="tenant-create-domain"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tenant-cors">CORS origins</Label>
          <Input
            id="tenant-cors"
            value={corsInput}
            onChange={(e) => setCorsInput(e.currentTarget.value)}
            onKeyDown={handleCorsKey}
            onBlur={addCorsOrigin}
            data-testid="tenant-create-cors"
          />
          {corsOrigins.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {corsOrigins.map((origin, i) => (
                <StatusPill key={i} tone="neutral">
                  {origin}
                  <button
                    type="button"
                    onClick={() => removeCorsOrigin(i)}
                    className="ml-1 hover:text-destructive"
                    aria-label={`Удалить ${origin}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </StatusPill>
              ))}
            </div>
          )}
        </div>

        <div className="pt-2">
          <Button
            onClick={handleSubmit}
            disabled={create.isPending}
            data-testid="tenant-create-submit"
          >
            {create.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Создать
          </Button>
        </div>
      </div>
    </Page>
  );
}

export default TenantCreatePage;
