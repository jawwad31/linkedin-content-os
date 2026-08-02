import Link from "next/link";

import { cn } from "@/lib/utils";

export const RESEARCH_TABS = [
  { id: "focus", label: "Focus & Sources" },
  { id: "articles", label: "Collected Articles" },
  { id: "trendcards", label: "TrendCards" },
  { id: "runs", label: "Runs" },
] as const;

export type ResearchTabId = (typeof RESEARCH_TABS)[number]["id"];

export function parseResearchTab(value: string | undefined): ResearchTabId {
  return RESEARCH_TABS.some((tab) => tab.id === value)
    ? (value as ResearchTabId)
    : "focus";
}

/**
 * Server-renderable — no client JS needed. Each tab is a real link carrying
 * the current filters, so refresh/back/forward and prefetch all work for
 * free. Active state is decided server-side from the parsed search param.
 */
export function ResearchTabs({
  clientId,
  activeTab,
  counts,
}: {
  clientId: string;
  activeTab: ResearchTabId;
  counts: Partial<Record<ResearchTabId, number>>;
}) {
  return (
    <div
      role="tablist"
      aria-label="Research sections"
      className="flex flex-wrap gap-1 border-b border-border-grey"
    >
      {RESEARCH_TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        const count = counts[tab.id];

        return (
          <Link
            key={tab.id}
            href={`/client/${clientId}/research?tab=${tab.id}`}
            role="tab"
            aria-selected={isActive}
            className={cn(
              "flex items-center gap-1.5 rounded-t-control border-b-2 px-3 py-2 text-small font-medium transition-colors",
              isActive
                ? "border-brand-purple text-brand-purple"
                : "border-transparent text-muted-foreground hover:text-near-black",
            )}
          >
            {tab.label}
            {typeof count === "number" ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 font-mono text-caption",
                  isActive
                    ? "bg-brand-purple/10 text-brand-purple"
                    : "bg-soft-white text-muted-foreground",
                )}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
