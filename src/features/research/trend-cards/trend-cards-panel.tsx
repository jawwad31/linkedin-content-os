import { TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  canRoleManageWorkflowReview,
  canRoleMutateClientWorkflow,
  type EffectiveClientRole,
} from "@/lib/access/roles";
import { formatDateOnly, formatUtcDate } from "@/lib/format/date";

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
}: {
  label: string;
  text: string | null;
}) {
  if (!text) return null;
  return (
    <div>
      <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 whitespace-pre-line text-small text-near-black">
        {text}
      </p>
    </div>
  );
}

export function TrendCardsPanel({
  clientId,
  role,
  cards,
}: {
  clientId: string;
  role: EffectiveClientRole;
  cards: TrendCard[];
}) {
  const canMutateWorkflow = canRoleMutateClientWorkflow(role);
  const canManageReview = canRoleManageWorkflowReview(role);

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
      {groupByWeek(cards).map(([weekOf, weekCards]) => (
        <div key={weekOf} className="flex flex-col gap-3">
          <p className="font-mono text-caption font-medium uppercase tracking-wide text-muted-foreground">
            Week of {formatDateOnly(weekOf)}
          </p>

          {weekCards.map((card) => (
            <div
              key={card.id}
              className="flex flex-col gap-2 rounded-control border border-border-grey bg-soft-white p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-small font-medium text-near-black">
                  {card.title}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
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
                  <Badge variant={card.approvedForIdeas ? "success" : "neutral"}>
                    {card.approvedForIdeas
                      ? "Approved for Ideas"
                      : "Not yet approved"}
                  </Badge>
                </div>
              </div>

              {card.shift ? (
                <p className="text-small text-near-black">{card.shift}</p>
              ) : null}

              <CardSection label="Why it matters" text={card.whyItMatters} />
              <CardSection label="Relevance to ICP" text={card.relevanceToIcp} />
              <CardSection label="Content angle" text={card.contentAngle} />

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

              {canMutateWorkflow ? (
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
