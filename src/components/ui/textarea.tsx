import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full rounded-control border border-border-default bg-white px-3 py-2.5 text-small text-near-black outline-none transition-colors duration-[140ms] placeholder:text-muted-foreground focus-visible:border-cyan-500 focus-visible:shadow-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-45 disabled:bg-surface-hover",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
