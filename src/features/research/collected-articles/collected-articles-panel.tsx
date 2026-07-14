import { Layers } from "lucide-react";
import Link from "next/link";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  canRoleMutateClientWorkflow,
  type EffectiveClientRole,
} from "@/lib/access/roles";
import { formatUtcDate } from "@/lib/format/date";

import { CollectedArticleActions, ArticleDeleteButton } from "./collected-article-actions";
import type {
  CollectedArticle,
  CollectedArticleCounts,
  CollectedArticleStatus,
  CollectedArticleStatusFilter,
} from "./queries";

const STATUS_BADGE_VARIANT: Record<CollectedArticleStatus, BadgeProps["variant"]> = {
  new: "neutral",
  relevant: "success",
  irrelevant: "outline",
  used: "info",
};

const STATUS_LABEL: Record<CollectedArticleStatus, string> = {
  new: "New",
  relevant: "Relevant",
  irrelevant: "Irrelevant",
  used: "Used",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return formatUtcDate(value);
}

function getScoreBadgeVariant(score: number | null): BadgeProps["variant"] {
  if (score === null) return "outline";
  if (score >= 7 && score <= 10) return "success";
  if (score >= 4 && score <= 6) return "warning";
  if (score >= 1 && score <= 3) return "neutral";
  return "outline";
}

const FILTERS: Array<{ value: CollectedArticleStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "relevant", label: "Relevant" },
  { value: "irrelevant", label: "Irrelevant" },
  { value: "used", label: "Used" },
];

function StatusFilterChips({
  clientId,
  activeStatus,
  counts,
}: {
  clientId: string;
  activeStatus: CollectedArticleStatusFilter;
  counts: CollectedArticleCounts | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {FILTERS.map((filter) => {
        const isActive = filter.value === activeStatus;
        const count = counts ? counts[filter.value] : null;
        const href =
          filter.value === "all"
            ? `/client/${clientId}/research`
            : `/client/${clientId}/research?articles=${filter.value}`;

        return (
          <Link
            key={filter.value}
            href={href}
            className={
              isActive
                ? "rounded-full bg-brand-orange/10 px-2.5 py-0.5 text-caption font-medium text-brand-orange focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2"
                : "rounded-full border border-border-grey px-2.5 py-0.5 text-caption font-medium text-muted-foreground hover:bg-soft-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2"
            }
          >
            {filter.label}
            {count !== null ? ` (${count})` : ""}
          </Link>
        );
      })}
    </div>
  );
}

export function CollectedArticlesPanel({
  clientId,
  role,
  articles,
  activeStatus,
  counts,
}: {
  clientId: string;
  role: EffectiveClientRole;
  articles: CollectedArticle[];
  activeStatus: CollectedArticleStatusFilter;
  counts: CollectedArticleCounts | null;
}) {
  const canManage = canRoleMutateClientWorkflow(role);

  if (articles.length === 0 && activeStatus === "all") {
    return (
      <EmptyState
        icon={Layers}
        title="No collected articles yet"
        description="Articles will appear here once research is running."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <StatusFilterChips
        clientId={clientId}
        activeStatus={activeStatus}
        counts={counts}
      />

      {articles.length === 0 ? (
        <p className="text-small text-muted-foreground">
          No {STATUS_LABEL[activeStatus as CollectedArticleStatus]?.toLowerCase() ?? ""}{" "}
          articles right now.
        </p>
      ) : null}

      <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
        {articles.map((article) => (
        <div
          key={article.id}
          className="flex flex-col gap-2 rounded-control border border-border-grey bg-soft-white p-3"
        >
          <a
            href={article.url}
            target="_blank"
            rel="noreferrer noopener"
            className="text-small font-medium text-near-black underline-offset-2 hover:underline"
          >
            {article.title}
          </a>

          <div className="flex flex-wrap items-center gap-2 font-mono text-caption text-muted-foreground">
            <span>{article.sourceName ?? "Unknown source"}</span>
            <span>·</span>
            <span>{formatDate(article.publishedAt)}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={STATUS_BADGE_VARIANT[article.status]}>
              {STATUS_LABEL[article.status]}
            </Badge>
            <Badge variant={getScoreBadgeVariant(article.relevanceScore)}>
              {article.relevanceScore !== null ? `Relevance ${article.relevanceScore}/10` : "Not scored"}
            </Badge>
          </div>

          {article.classificationReason ? (
            <p className="text-small text-muted-foreground">
              {article.classificationReason}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            {canManage && article.status !== "used" ? (
              <CollectedArticleActions
                clientId={clientId}
                itemId={article.id}
                status={article.status}
              />
            ) : null}
            {(role === "agency_admin" || role === "client_admin") && (
              <ArticleDeleteButton
                clientId={clientId}
                articleId={article.id}
                articleTitle={article.title}
              />
            )}
          </div>
          </div>
        ))}
      </div>
    </div>
  );
}
