import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-10 w-full rounded-control border border-border-grey bg-white px-3 text-body text-near-black outline-none transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-brand-orange/50 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
