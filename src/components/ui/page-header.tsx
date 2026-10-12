import Link from "next/link";
import type { ReactNode } from "react";

/**
 * One step of a breadcrumb. Earlier steps carry an `href` and render as links; the last
 * step is the page itself and has no `href` (it is plain text and the page heading).
 */
export type BreadcrumbItem = {
  label: string;
  href?: string;
};

/**
 * Either a plain `title`, or a `breadcrumb` (detail pages). With a breadcrumb the last
 * item is the heading; `title` is not used.
 */
type PageHeaderProps = {
  description?: string;
  action?: ReactNode;
} & (
  | { title: string; breadcrumb?: undefined }
  | { breadcrumb: BreadcrumbItem[]; title?: undefined }
);

const HEADING_CLASS =
  "min-w-0 text-page-title-mobile font-heading font-semibold text-near-black sm:text-page-title lg:group-data-[client-shell]/shell:text-section-title";

/**
 * Page title and its one primary action. Inside the client app on large screens this is
 * the 60px top bar (white, hairline under it, full width of the content column); the
 * description sits under the bar. Elsewhere (phones) it is a plain heading row.
 * A `breadcrumb` (for example "Newsletter / November edition") replaces the title on detail
 * pages. Its heading is one line and truncates; the full label is in its title attribute.
 */
export function PageHeader({
  title,
  breadcrumb,
  description,
  action,
}: PageHeaderProps) {
  const current = breadcrumb?.[breadcrumb.length - 1];
  const parents = breadcrumb?.slice(0, -1) ?? [];

  const heading =
    breadcrumb && current ? (
      <nav aria-label="Breadcrumb" className="flex min-w-0 sm:flex-1">
        <ol className="flex min-w-0 items-center gap-2 text-small">
          {parents.map((item, index) => (
            <li key={index} className="flex shrink-0 items-center gap-2">
              {item.href ? (
                <Link
                  href={item.href}
                  className="inline-flex min-h-[38px] items-center whitespace-nowrap text-muted-foreground hover:text-near-black"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="whitespace-nowrap text-muted-foreground">
                  {item.label}
                </span>
              )}
              <span aria-hidden="true" className="text-muted-foreground">
                /
              </span>
            </li>
          ))}
          <li className="min-w-0 flex-1">
            <h1
              aria-current="page"
              title={current.label}
              className={`${HEADING_CLASS} block truncate`}
            >
              {current.label}
            </h1>
          </li>
        </ol>
      </nav>
    ) : (
      <h1 className={`${HEADING_CLASS} break-words`}>{title}</h1>
    );

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
        {heading}
        {action ? <div className="sm:shrink-0">{action}</div> : null}
      </div>
      {description ? (
        <p className="max-w-3xl text-small text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}
