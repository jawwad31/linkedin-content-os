import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-[38px] w-full rounded-control border border-border-default bg-white px-3 text-small text-near-black outline-none transition-colors duration-[140ms] placeholder:text-muted-foreground focus-visible:border-cyan-500 focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-45 disabled:bg-surface-hover",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
