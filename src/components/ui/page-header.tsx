import type { ReactNode } from "react";

/**
 * Page title and its one primary action. Inside the client app on large screens this is
 * the 60px top bar (white, hairline under it, full width of the content column); the
 * description sits under the bar. Elsewhere (agency pages, phones) it is a plain heading row.
 */
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
    <div className="flex min-w-0 flex-col gap-3 lg:group-data-[client-shell]/shell:gap-4">
      <div
        className={[
          "flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
          // The white bar and its hairline run edge to edge: a pseudo-element wider than the
          // viewport, clipped by the shell's overflow-x-clip, so the 1280px content cap does not shorten it.
          "lg:group-data-[client-shell]/shell:relative lg:group-data-[client-shell]/shell:isolate lg:group-data-[client-shell]/shell:h-[60px] lg:group-data-[client-shell]/shell:items-center",
          "lg:group-data-[client-shell]/shell:before:absolute lg:group-data-[client-shell]/shell:before:inset-y-0 lg:group-data-[client-shell]/shell:before:-left-[100vw] lg:group-data-[client-shell]/shell:before:-right-[100vw]",
          "lg:group-data-[client-shell]/shell:before:-z-10 lg:group-data-[client-shell]/shell:before:border-b lg:group-data-[client-shell]/shell:before:border-border-subtle lg:group-data-[client-shell]/shell:before:bg-white lg:group-data-[client-shell]/shell:before:content-['']",
        ].join(" ")}
      >
        <h1 className="min-w-0 break-words text-page-title-mobile font-heading font-semibold text-near-black sm:text-page-title lg:group-data-[client-shell]/shell:text-section-title">
          {title}
        </h1>
        {action ? <div className="sm:shrink-0">{action}</div> : null}
      </div>
      {description ? (
        <p className="max-w-3xl text-small text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
