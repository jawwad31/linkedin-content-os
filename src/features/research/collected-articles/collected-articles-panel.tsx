"use client";

import { ChevronLeft, ChevronRight, Layers } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  BulkDeleteControls,
  useBulkSelection,
} from "@/components/shared/bulk-delete-controls";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cannotReason } from "@/lib/access/permission-copy";
import {
  canRoleContributeResearch,
  canRoleDraftPosts,
  canRoleManageIdeas,
  type ClientPermission,
  type EffectiveClientRole,
} from "@/lib/access/roles";
import { formatUtcDate } from "@/lib/format/date";
import { cn } from "@/lib/utils";

import { CollectedArticleActions, ArticleDeleteButton } from "./collected-article-actions";
import { SaveArticleButton } from "./save-article-button";
import type {
  CollectedArticle,
  CollectedArticleCounts,
  CollectedArticlesPagination,
  CollectedArticleStatus,
  CollectedArticleStatusFilter,
} from "./queries";
import {
  COLLECTED_ARTICLE_PAGE_SIZES,
  type CollectedArticlePageSize,
} from "./pagination";

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
  pageSize,
  onNavigate,
}: {
  clientId: string;
  activeStatus: CollectedArticleStatusFilter;
  counts: CollectedArticleCounts | null;
  pageSize: number;
  onNavigate?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {FILTERS.map((filter) => {
        const isActive = filter.value === activeStatus;
        const count = counts ? counts[filter.value] : null;
        const params = new URLSearchParams({ tab: "rss" });
        if (filter.value !== "all") params.set("articles", filter.value);
        params.set("article_page_size", String(pageSize));
        const href = `/client/${clientId}/research?${params.toString()}`;

        return (
          <Link
            key={filter.value}
            href={href}
            onClick={onNavigate}
            className={
              isActive
                ? "rounded-full bg-brand-orange/10 px-2.5 py-0.5 text-caption font-medium text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2"
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
  permissions,
  articles,
  activeStatus,
  counts,
  pagination,
}: {
  clientId: string;
  role: EffectiveClientRole;
  permissions: ClientPermission[];
  articles: CollectedArticle[];
  activeStatus: CollectedArticleStatusFilter;
  counts: CollectedArticleCounts | null;
  pagination: CollectedArticlesPagination;
}) {
  const router = useRouter();
  const canManage = canRoleContributeResearch(role, permissions);
  const canDraft = canRoleDraftPosts(role, permissions);
  const canPlan = canRoleManageIdeas(role, permissions);
  const canDelete = role === "client_admin";
  const canBulkManage = canManage || canDelete;
  const selection = useBulkSelection(articles.map((article) => article.id));

  function buildPageHref(
    page: number,
    pageSize: CollectedArticlePageSize = pagination.pageSize,
  ) {
    const params = new URLSearchParams({ tab: "rss" });
    if (activeStatus !== "all") params.set("articles", activeStatus);
    params.set("article_page", String(page));
    params.set("article_page_size", String(pageSize));
    return `/client/${clientId}/research?${params.toString()}`;
  }

  if (articles.length === 0 && activeStatus === "all") {
    return (
      <EmptyState
        icon={Layers}
        title="No collected articles yet"
        description="Add a feed above and press Run RSS feeds. New articles will appear here."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <StatusFilterChips
        clientId={clientId}
        activeStatus={activeStatus}
        counts={counts}
        pageSize={pagination.pageSize}
        onNavigate={selection.cancel}
      />

      <p className="text-caption text-muted-foreground">
        Relevant means the article matches your Research Focus. Saving an
        article puts it in the Content Bank as a trend reaction you can turn
        into a post.
      </p>

      {canBulkManage && articles.length > 0 ? (
        <BulkDeleteControls
          clientId={clientId}
          entityType="collected_article"
          recordLabel="Collected Article"
          pluralLabel="Collected Articles"
          visibleCount={articles.length}
          selection={selection}
          allowDelete={canDelete}
          articleStatusActions={canManage}
        />
      ) : null}

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
          className={cn(
            "flex flex-col gap-2 rounded-control border border-border-grey bg-soft-white p-3 transition-colors",
            selection.isSelected(article.id) &&
              "border-brand-purple/50 bg-brand-purple/5 ring-1 ring-brand-purple/20",
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            {canBulkManage && selection.isSelectionMode ? (
              <input
                type="checkbox"
                checked={selection.isSelected(article.id)}
                onChange={(event) =>
                  selection.toggle(
                    article.id,
                    (event.nativeEvent as MouseEvent).shiftKey,
                  )
                }
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-border-grey accent-brand-purple"
                aria-label={`Select Collected Article: ${article.title}`}
              />
            ) : null}
            <a
              href={article.url}
              target="_blank"
              rel="noreferrer noopener"
              className="min-w-0 flex-1 text-small font-medium text-near-black underline-offset-2 hover:underline"
            >
              {article.title}
            </a>
            <div className="flex flex-wrap items-center gap-1.5 shrink-0">
              <Badge variant={STATUS_BADGE_VARIANT[article.status]}>
                {STATUS_LABEL[article.status]}
              </Badge>
              <Badge variant={getScoreBadgeVariant(article.relevanceScore)}>
                {article.relevanceScore !== null ? `Relevance ${article.relevanceScore}/10` : "Not scored"}
              </Badge>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono text-caption text-muted-foreground">
            <span>{article.sourceName ?? "Unknown source"}</span>
            <span>·</span>
            <span>{formatDate(article.publishedAt)}</span>
          </div>

          {article.classificationReason ? (
            <p className="text-small text-muted-foreground">
              {article.classificationReason}
            </p>
          ) : null}

          <div className="flex flex-wrap items-start gap-3">
            {!selection.isSelectionMode ? (
              <SaveArticleButton
                clientId={clientId}
                articleId={article.id}
                articleTitle={article.title}
                savedEntryId={article.contentBankEntryId}
                canSave={canManage}
                saveReason={cannotReason("save articles to the Content Bank", ["research_contribute"])}
                canCreatePosts={canPlan && canDraft}
                createPostsReason={cannotReason("create posts", [
                  ...(canPlan ? [] : ["ideas_manage" as const]),
                  ...(canDraft ? [] : ["posts_draft" as const]),
                ])}
                canAddToCalendar={canPlan}
                addToCalendarReason={cannotReason("add entries to the calendar", ["ideas_manage"])}
              />
            ) : null}
            {canManage &&
            article.status !== "used" &&
            !selection.isSelectionMode ? (
              <CollectedArticleActions
                clientId={clientId}
                itemId={article.id}
                status={article.status}
              />
            ) : null}
            {canDelete && !selection.isSelectionMode ? (
              <ArticleDeleteButton
                clientId={clientId}
                articleId={article.id}
                articleTitle={article.title}
              />
            ) : null}
          </div>
          </div>
        ))}
      </div>

      {pagination.total > 0 ? (
        <div className="flex flex-col gap-3 border-t border-border-grey pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-small text-muted-foreground">
            <span>
              Page {pagination.page} of {pagination.totalPages} · {pagination.total}{" "}
              article{pagination.total === 1 ? "" : "s"}
            </span>
            <label className="inline-flex items-center gap-2">
              <span>Rows per page</span>
              <select
                value={pagination.pageSize}
                onChange={(event) => {
                  selection.cancel();
                  router.push(
                    buildPageHref(
                      1,
                      Number(event.target.value) as CollectedArticlePageSize,
                    ),
                  );
                }}
                className="rounded-control border border-border-grey bg-white px-2 py-1 text-small text-near-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50"
                aria-label="Collected articles per page"
              >
                {COLLECTED_ARTICLE_PAGE_SIZES.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2">
            {pagination.page > 1 ? (
              <Link
                href={buildPageHref(pagination.page - 1)}
                onClick={selection.cancel}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                Previous
              </Link>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled>
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                Previous
              </Button>
            )}
            {pagination.page < pagination.totalPages ? (
              <Link
                href={buildPageHref(pagination.page + 1)}
                onClick={selection.cancel}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Next
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            ) : (
              <Button type="button" variant="outline" size="sm" disabled>
                Next
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
