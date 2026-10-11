import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/** Pill with a hairline border in its own hue, as in the design system. */
const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-caption font-medium",
  {
    variants: {
      variant: {
        neutral: "border-border-default bg-surface-sunken text-muted-foreground",
        success: "border-success/35 bg-success/10 text-success-strong",
        warning: "border-warning/40 bg-warning/10 text-warning-strong",
        danger: "border-danger/35 bg-danger/10 text-danger-strong",
        info: "border-cyan-500/35 bg-accent-primary-soft text-link",
        "accent-orange": "border-cyan-500/35 bg-accent-primary-soft text-link",
        "accent-purple": "border-violet-500/35 bg-accent-secondary-soft text-secondary-dark",
        outline: "border-border-default bg-transparent text-near-black",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, className }))} {...props} />
  );
}

export { Badge, badgeVariants };
