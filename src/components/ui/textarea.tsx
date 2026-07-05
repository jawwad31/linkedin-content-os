import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full rounded-control border border-border-grey bg-soft-white px-3.5 py-2.5 text-body text-near-black outline-none transition-colors placeholder:text-muted-foreground focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-brand-orange/50 disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-soft-white",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
