import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "./utils";

/**
 * Badge — minimal pill.
 *
 * Style is Kaggle-ish: outlined neutral pill by default. Filled variants are
 * kept for cases that genuinely need stronger emphasis (e.g. "Institutional"
 * tag on the admin overview) but the default is the quiet outline.
 *
 * For status indicators with a coloured dot, prefer `<StatusPill>` from
 * `@/components/common/StatusPill`.
 */
const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        // Muted tinted fills — same quiet visual language as
        // <RoleBadge>/<StatusPill>; dark-mode text held at ~80% to avoid neon.
        default:
          "border-transparent bg-primary/10 text-primary/90 [a&]:hover:bg-primary/20",
        secondary:
          "border-transparent bg-slate-500/10 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300/80 [a&]:hover:bg-slate-500/15",
        destructive:
          "border-transparent bg-red-500/10 text-red-600 dark:bg-red-400/10 dark:text-red-300/80 [a&]:hover:bg-red-500/15",
        outline:
          "border-transparent bg-slate-500/10 text-slate-600 dark:bg-slate-400/10 dark:text-slate-300/80 [a&]:hover:bg-slate-500/15",
      },
    },
    defaultVariants: {
      variant: "outline",
    },
  },
);

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span";

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
