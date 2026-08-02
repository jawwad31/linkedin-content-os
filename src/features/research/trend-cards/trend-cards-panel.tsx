"use client";

import { TrendingUp } from "lucide-react";

import {
  BulkDeleteControls,
  useBulkSelection,
} from "@/components/shared/bulk-delete-controls";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  canRoleManageWorkflowReview,
  canRoleContributeResearch,
  type ClientPermission,
  type EffectiveClientRole,
} from "@/lib/access/roles";
import { formatDateOnly, formatUtcDate } from "@/lib/format/date";
import { cn } from "@/lib/utils";

import { TrendCardReviewControls } from "./trend-card-review-controls";
import type { TrendCard } from "./queries";

function groupByWeek(cards: TrendCard[]): Array<[string, TrendCard[]]> {
  const groups = new Map<string, TrendCard[]>();
  for (const card of cards) {
    const group = groups.get(card.weekOf);
    if (group) {
      group.push(card);
    } else {
      groups.set(card.weekOf, [card]);
    }
  }
  // Cards arrive ordered week_of desc, created_at desc, so Map insertion
  // order is already newest week first.
  return Array.from(groups.entries());
}

function CardSection({
  label,
  text,
  labelClassName,
}: {
  label: string;
  text: string | null;
  labelClassName?: string;
}) {
  if (!text) return null;
  return (
    <div>
      <p
        className={
          "text-caption font-medium uppercase tracking-wide " +
          (labelClassName ?? "text-muted-foreground")
        }
      >
        {label}
      </p>
      <p className="mt-1 whitespace-pre-line text-body text-near-black">
        {text}
      </p>
    </div>
  );
}

export function TrendCardsPanel({
  clientId,
  role,
  permissions,
  cards,
}: {
  clientId: string;
  role: EffectiveClientRole;
  permissions: ClientPermission[];
  cards: TrendCard[];
}) {
  const canMutateWorkflow = canRoleContributeResearch(role, permissions);
  const canManageReview = canRoleManageWorkflowReview(role);
  const selection = useBulkSelection(cards.map((card) => card.id));

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No TrendCards yet"
        description="TrendCards will appear here once research is running."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {canManageReview ? (
        <BulkDeleteControls
          clientId={clientId}
          entityType="trend_card"
          recordLabel="TrendCard"
          pluralLabel="TrendCards"
          visibleCount={cards.length}
          selection={selection}
        />
      ) : null}
      {groupByWeek(cards).map(([weekOf, weekCards]) => (
        <div key={weekOf} className="flex flex-col gap-3">
          <p className="font-mono text-caption font-medium uppercase tracking-wide text-muted-foreground">
            Week of {formatDateOnly(weekOf)}
          </p>

          {weekCards.map((card) => (
            <div
              key={card.id}
              className={cn(
                "flex flex-col gap-3 rounded-control border border-border-grey bg-soft-white p-3 transition-colors",
                selection.isSelected(card.id) &&
                  "border-brand-purple/50 bg-brand-purple/5 ring-1 ring-brand-purple/20",
              )}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                {canManageReview && selection.isSelectionMode ? (
                  <input
                    type="checkbox"
                    checked={selection.isSelected(card.id)}
                    onChange={(event) =>
                      selection.toggle(
                        card.id,
                        (event.nativeEvent as MouseEvent).shiftKey,
                      )
                    }
                    className="mr-1 h-4 w-4 shrink-0 rounded border-border-grey accent-brand-purple"
                    aria-label={`Select TrendCard: ${card.title}`}
                  />
                ) : null}
                <Badge variant={card.approvedForIdeas ? "success" : "neutral"}>
                  {card.approvedForIdeas ? "Approved for Ideas" : "Pending Review"}
                </Badge>
                {card.confidenceScore !== null ? (
                  <Badge variant="outline">
                    Confidence {card.confidenceScore}/10
                  </Badge>
                ) : null}
                {card.reactionCount > 0 ? (
                  <Badge variant="accent-orange">
                    {card.reactionCount} reaction
                    {card.reactionCount === 1 ? "" : "s"}
                  </Badge>
                ) : null}
              </div>

              <p className="text-body font-medium text-near-black">
                {card.title}
              </p>

              <div className="grid grid-cols-1 gap-3 rounded-control bg-white p-3 sm:grid-cols-2">
                <CardSection label="Market Shift" text={card.shift} />
                <CardSection
                  label="ICP Relevance"
                  text={card.relevanceToIcp}
                  labelClassName="text-brand-purple"
                />
                <CardSection label="Why It Matters" text={card.whyItMatters} />
                <CardSection
                  label="Suggested Content Angle"
                  text={card.contentAngle}
                  labelClassName="text-brand-orange"
                />
              </div>

              {card.sources.length > 0 ? (
                <details>
                  <summary className="cursor-pointer select-none text-caption font-medium uppercase tracking-wide text-muted-foreground">
                    Sources ({card.sources.length})
                  </summary>
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    {card.sources.map((source) => (
                      <a
                        key={source.id}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="rounded-control border border-border-grey bg-white px-2.5 py-1.5 text-small text-brand-orange underline-offset-2 hover:underline"
                      >
                        {source.title}
                      </a>
                    ))}
                  </div>
                </details>
              ) : null}

              {canMutateWorkflow && !selection.isSelectionMode ? (
                <TrendCardReviewControls
                  clientId={clientId}
                  cardId={card.id}
                  cardTitle={card.title}
                  approvedForIdeas={card.approvedForIdeas}
                  reactionCount={card.reactionCount}
                  canManageReview={canManageReview}
                />
              ) : null}

              <div className="flex flex-wrap items-center gap-2 font-mono text-caption text-muted-foreground">
                <span>{formatUtcDate(card.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
