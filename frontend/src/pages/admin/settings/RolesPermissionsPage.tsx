/**
 * /admin/roles — read-only matrix of roles × permissions for admin reference.
 *
 * Loads roles from `GET /roles` and per-role permissions from
 * `GET /roles/{role}/permissions` (Identity Service §J — see
 * services/identity/src/identity_service/api/v1/roles.py). The matrix is
 * built client-side from those responses — no static fallback.
 */
import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RolePermissionsMatrix } from '@/components/admin/RolePermissionsMatrix';
import { Page, PageHeader } from '@/components/layout/Page';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { systemApi } from '@/api/endpoints/system';
import { systemKeys, useRoles } from '@/hooks/api/useSystem';
import type { GlobalRole, Problem } from '@/api/types';

export function RolesPermissionsPage() {
  useDocumentTitle('Roles & permissions');

  const rolesQ = useRoles();
  const roleNames = useMemo(
    () => (rolesQ.data ?? []).map((r) => r.name as GlobalRole),
    [rolesQ.data],
  );

  const permsQueries = useQueries({
    queries: roleNames.map((role) => ({
      queryKey: systemKeys.rolePermissions(role),
      queryFn: () => systemApi.rolePermissions(role),
    })),
  });

  const isLoading =
    rolesQ.isLoading || permsQueries.some((q) => q.isLoading);
  const errored =
    rolesQ.error ?? permsQueries.find((q) => q.error)?.error ?? null;

  const { permissions, matrix } = useMemo(() => {
    if (roleNames.length === 0 || permsQueries.some((q) => !q.data)) {
      return {
        permissions: [] as string[],
        matrix: {} as Record<GlobalRole, Record<string, boolean>>,
      };
    }
    const allPerms = new Set<string>();
    permsQueries.forEach((q) => {
      q.data?.permissions.forEach((p) => allPerms.add(p));
    });
    const sortedPerms = Array.from(allPerms).sort();
    const m: Record<GlobalRole, Record<string, boolean>> = {} as Record<
      GlobalRole,
      Record<string, boolean>
    >;
    roleNames.forEach((role, idx) => {
      const granted = new Set(permsQueries[idx]?.data?.permissions ?? []);
      m[role] = Object.fromEntries(sortedPerms.map((p) => [p, granted.has(p)]));
    });
    return { permissions: sortedPerms, matrix: m };
  }, [roleNames, permsQueries]);

  return (
    <Page width="wide">
      <PageHeader title="Roles & permissions" />

      <div className="space-y-4">
        {errored && <ProblemAlert problem={errored as unknown as Problem} />}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : permissions.length === 0 ? (
          <Alert data-testid="roles-empty-alert" className="border-amber-500 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Не удалось загрузить матрицу</AlertDescription>
          </Alert>
        ) : (
          <RolePermissionsMatrix permissions={permissions} matrix={matrix} />
        )}
      </div>
    </Page>
  );
}

export default RolesPermissionsPage;
