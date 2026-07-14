import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-btn text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none",
  {
    variants: {
      variant: {
        // Primary / main CTA — real primary actions only (login, save,
        // complete setup, future real generation actions).
        gradient:
          "bg-gradient-brand text-white shadow-sm hover:opacity-90 hover:shadow-md active:scale-[0.98]",
        // Accent orange — important but not global-primary actions.
        "accent-orange":
          "bg-brand-orange text-white shadow-sm hover:opacity-90 active:scale-[0.98]",
        // Accent purple — AI/action emphasis where appropriate.
        "accent-purple":
          "bg-brand-purple text-white shadow-sm hover:opacity-90 active:scale-[0.98]",
        secondary:
          "bg-white text-near-black border border-border-grey hover:bg-soft-white",
        outline:
          "bg-transparent text-near-black border border-border-grey hover:bg-soft-white",
        ghost: "bg-transparent text-near-black hover:bg-soft-white",
        destructive:
          "bg-danger text-white shadow-sm hover:opacity-90 active:scale-[0.98]",
        success:
          "bg-success text-white shadow-sm hover:opacity-90 active:scale-[0.98]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3 text-sm",
        lg: "h-11 px-6 text-body-lg",
        icon: "h-10 w-10",
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
