import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-heading font-semibold text-near-black">
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-small text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="sm:shrink-0">{action}</div> : null}
    </div>
  );
}
