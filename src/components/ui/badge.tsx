import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-caption font-medium",
  {
    variants: {
      variant: {
        neutral: "bg-soft-white text-near-black border border-border-grey",
        success: "bg-success/10 text-success-strong",
        warning: "bg-warning/10 text-warning-strong",
        danger: "bg-danger/10 text-danger-strong",
        info: "bg-info/10 text-info-strong",
        "accent-orange": "bg-brand-orange/10 text-primary-dark",
        "accent-purple": "bg-brand-purple/10 text-secondary-dark",
        outline: "border border-border-grey text-near-black",
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
