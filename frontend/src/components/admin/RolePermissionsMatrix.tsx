/**
 * Editable matrix of roles × permissions.
 *
 * Rows = the permission catalogue (with a Russian description + an (i) tooltip
 * showing the technical permission key). Columns = global roles. Each cell is a
 * checkbox; toggling persists via the parent's onToggle (PATCH).
 */
import { Info } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { roleLabel } from '@/lib/roles';
import type { PermissionMeta } from '@/api/endpoints/system';

interface Props {
  permissions: PermissionMeta[];
  roles: string[];
  granted: Record<string, Set<string>>;
  onToggle: (role: string, permission: string, checked: boolean) => void;
  disabled?: boolean;
}

export function RolePermissionsMatrix({
  permissions,
  roles,
  granted,
  onToggle,
  disabled,
}: Props) {
  return (
    <TooltipProvider delayDuration={200}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2.5 pr-4 text-left font-medium text-muted-foreground">
                Разрешение
              </th>
              {roles.map((r) => (
                <th
                  key={r}
                  className="px-3 py-2.5 text-center font-medium text-foreground"
                >
                  {roleLabel(r)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {permissions.map((p) => (
              <tr key={p.permission} data-testid={`perm-row-${p.permission}`}>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-1.5">
                    <span>{p.description ?? p.permission}</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex"
                          aria-label={p.permission}
                        >
                          <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <span className="font-mono text-xs">{p.permission}</span>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </td>
                {roles.map((r) => (
                  <td key={r} className="px-3 py-3 text-center">
                    <Checkbox
                      checked={granted[r]?.has(p.permission) ?? false}
                      disabled={disabled}
                      onCheckedChange={(v) => onToggle(r, p.permission, v === true)}
                      aria-label={`${roleLabel(r)} — ${p.permission}`}
                      data-testid={`perm-${p.permission}-${r}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </TooltipProvider>
  );
}

export default RolePermissionsMatrix;
