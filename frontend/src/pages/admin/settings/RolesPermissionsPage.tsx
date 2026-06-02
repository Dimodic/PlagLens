/**
 * /admin/roles — editable matrix of roles × permissions.
 *
 * Roles come from `GET /roles` ({ role, description }); the permission catalogue
 * from `GET /permissions`; per-role grants from `GET /roles/{role}/permissions`.
 * Toggling a checkbox PATCHes the role's full granted set.
 */
import { useEffect, useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { RolePermissionsMatrix } from '@/components/admin/RolePermissionsMatrix';
import { Page, PageHeader } from '@/components/layout/Page';
import { EmptyState } from '@/components/common/EmptyState';
import { ProblemAlert } from '@/components/common/ProblemAlert';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useNotifications } from '@/hooks/useNotifications';
import { useTranslation } from '@/i18n';
import {
  systemKeys,
  usePermissionsCatalogue,
  useRoles,
  useUpdateRolePermissions,
} from '@/hooks/api/useSystem';
import { systemApi } from '@/api/endpoints/system';
import type { Problem } from '@/api/types';

export function RolesPermissionsPage() {
  const { t } = useTranslation();
  useDocumentTitle(t('roles_permissions.title'));
  const notify = useNotifications();

  const rolesQ = useRoles();
  const catalogueQ = usePermissionsCatalogue();
  const update = useUpdateRolePermissions();

  const roleNames = useMemo(
    () => (rolesQ.data ?? []).map((r) => r.role),
    [rolesQ.data],
  );

  const permsQueries = useQueries({
    queries: roleNames.map((role) => ({
      queryKey: systemKeys.rolePermissions(role),
      queryFn: () => systemApi.rolePermissions(role),
    })),
  });

  // Local editable state: role -> Set(granted permission keys), seeded from server.
  const [granted, setGranted] = useState<Record<string, Set<string>>>({});
  const seedSignature = permsQueries.map((q) => q.dataUpdatedAt).join(',');
  useEffect(() => {
    if (roleNames.length === 0 || permsQueries.some((q) => !q.data)) return;
    const next: Record<string, Set<string>> = {};
    roleNames.forEach((role, i) => {
      next[role] = new Set(permsQueries[i]?.data?.permissions ?? []);
    });
    setGranted(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleNames.join(','), seedSignature]);

  const loading =
    rolesQ.isLoading || catalogueQ.isLoading || permsQueries.some((q) => q.isLoading);
  const errored =
    rolesQ.error ??
    catalogueQ.error ??
    permsQueries.find((q) => q.error)?.error ??
    null;

  const handleToggle = (role: string, permission: string, checked: boolean) => {
    const set = new Set(granted[role] ?? []);
    if (checked) set.add(permission);
    else set.delete(permission);
    setGranted((prev) => ({ ...prev, [role]: set }));
    update.mutate(
      { role, permissions: Array.from(set) },
      {
        onError: (e) =>
          notify.error(
            (e as unknown as Problem)?.detail ?? t('roles_permissions.save_failed'),
          ),
      },
    );
  };

  return (
    <Page width="wide">
      <PageHeader title={t('roles_permissions.title')} />

      <div className="space-y-4">
        {errored && <ProblemAlert problem={errored as unknown as Problem} />}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (catalogueQ.data?.length ?? 0) === 0 ? (
          <EmptyState title={t('roles_permissions.empty')} />
        ) : (
          <RolePermissionsMatrix
            permissions={catalogueQ.data ?? []}
            roles={roleNames}
            granted={granted}
            onToggle={handleToggle}
          />
        )}
      </div>
    </Page>
  );
}

export default RolesPermissionsPage;
