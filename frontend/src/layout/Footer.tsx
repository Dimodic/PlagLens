/**
 * Legacy footer — the redesigned shell has no global footer; the topbar +
 * sidebar carry all chrome. This file remains as a no-op export so any
 * residual `import { Footer }` keeps resolving until callers are migrated.
 */
export function Footer() {
  return (
    <div className="flex h-9 items-center justify-between px-4 text-xs text-muted-foreground">
      <span>PlagLens</span>
    </div>
  );
}
