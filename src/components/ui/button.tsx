import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-btn font-medium transition-colors duration-[140ms] ease-[cubic-bezier(.2,.6,.25,1)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)] active:translate-y-px disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        // The one primary action per view: Signal Cyan with dark text (cyan never
        // carries white text).
        brand:
          "bg-accent-primary text-on-accent-primary hover:bg-accent-primary-hover active:bg-accent-primary-press",
        // Second-order emphasis: Halo Violet (solid violet-700 so white text passes).
        "accent-orange":
          "bg-accent-secondary text-white hover:bg-accent-secondary-hover",
        "accent-purple":
          "bg-accent-secondary text-white hover:bg-accent-secondary-hover",
        secondary:
          "border border-border-default bg-white text-near-black hover:border-border-strong hover:bg-surface-hover",
        outline:
          "border border-border-default bg-transparent text-near-black hover:border-border-strong hover:bg-surface-hover",
        ghost: "bg-transparent text-near-black hover:bg-surface-hover",
        destructive: "bg-destructive text-white hover:brightness-95",
        success: "bg-success text-near-black hover:brightness-95",
      },
      size: {
        default: "h-[38px] px-4 text-small",
        sm: "h-[30px] px-3 text-small",
        lg: "h-[46px] px-6 text-body-lg",
        icon: "h-[38px] w-[38px]",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
