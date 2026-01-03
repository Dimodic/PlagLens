/**
 * Read-only matrix of roles × permissions for admin reference.
 */
import { Check, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { GlobalRole } from '@/api/types';

interface Props {
  permissions: string[];
  matrix: Record<GlobalRole, Record<string, boolean>>;
}

const ROLES: GlobalRole[] = ['super_admin', 'admin', 'teacher', 'student'];

export function RolePermissionsMatrix({ permissions, matrix }: Props) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="space-y-2">
          <h5 className="text-base font-medium">Roles × Permissions</h5>
          <p className="text-xs text-muted-foreground">
            Read-only reference matrix. Источник правды — backend RBAC config.
          </p>
          <ScrollArea>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>permission</TableHead>
                  {ROLES.map((r) => (
                    <TableHead key={r}>{r}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {permissions.map((p) => (
                  <TableRow key={p}>
                    <TableCell>
                      <span className="font-mono text-xs">{p}</span>
                    </TableCell>
                    {ROLES.map((r) => (
                      <TableCell key={r}>
                        {matrix[r]?.[p] ? (
                          <Check className="h-4 w-4 text-sev-low" />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground" />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  );
}

export default RolePermissionsMatrix;
