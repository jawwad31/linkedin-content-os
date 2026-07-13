import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-14 w-full rounded-lg border border-outline bg-transparent px-4 text-body-lg text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/60 focus-visible:border-primary focus-visible:border-2 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 hover:border-on-surface-variant",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
