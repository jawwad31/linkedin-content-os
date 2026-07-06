import { Layers } from "lucide-react";

import { Badge, type BadgeProps } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { ClientRole } from "@/features/clients/invitations/schemas";

import { CollectedArticleActions } from "./collected-article-actions";
import type { CollectedArticle, CollectedArticleStatus } from "./queries";

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
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CollectedArticlesPanel({
  clientId,
  role,
  articles,
}: {
  clientId: string;
  role: ClientRole;
  articles: CollectedArticle[];
}) {
  const canManage = role === "owner" || role === "editor";

  if (articles.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No collected articles yet"
        description="Articles will appear here once research is running."
      />
    );
  }

  return (
    <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
      {articles.map((article) => (
        <div
          key={article.id}
          className="flex flex-col gap-2 rounded-control border border-border-grey bg-soft-white p-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <a
              href={article.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-small font-medium text-near-black underline-offset-2 hover:underline"
            >
              {article.title}
            </a>
            <Badge variant={STATUS_BADGE_VARIANT[article.status]}>
              {STATUS_LABEL[article.status]}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono text-caption text-muted-foreground">
            <span>{article.sourceName ?? "Unknown source"}</span>
            <span>·</span>
            <span>{formatDate(article.publishedAt)}</span>
            {article.relevanceScore !== null ? (
              <>
                <span>·</span>
                <span>Score {article.relevanceScore}/10</span>
              </>
            ) : null}
          </div>

          {article.classificationReason ? (
            <p className="text-small text-muted-foreground">
              {article.classificationReason}
            </p>
          ) : null}

          {canManage && article.status !== "used" ? (
            <CollectedArticleActions
              clientId={clientId}
              itemId={article.id}
              status={article.status}
            />
          ) : null}
        </div>
      ))}
    </div>
  );
}
