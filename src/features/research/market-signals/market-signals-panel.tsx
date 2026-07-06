import { TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { ClientRole } from "@/features/clients/invitations/schemas";

import { MarketSignalReviewControls } from "./market-signal-review-controls";
import type { MarketSignal } from "./queries";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function MarketSignalsPanel({
  clientId,
  role,
  signals,
}: {
  clientId: string;
  role: ClientRole;
  signals: MarketSignal[];
}) {
  const canManage = role === "owner" || role === "editor";

  if (signals.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No Market Signals yet"
        description="Signals will appear here once research is running."
      />
    );
  }

  return (
    <div className="flex max-h-96 flex-col gap-3 overflow-y-auto">
      {signals.map((signal) => (
        <div
          key={signal.id}
          className="flex flex-col gap-2 rounded-control border border-border-grey bg-soft-white p-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="text-small font-medium text-near-black">
              {signal.title}
            </p>
            <Badge variant={signal.approvedForIdeas ? "success" : "neutral"}>
              {signal.approvedForIdeas ? "Approved for Ideas" : "Not yet approved"}
            </Badge>
          </div>

          {signal.signalSummary ? (
            <p className="text-small text-near-black">{signal.signalSummary}</p>
          ) : null}

          {signal.whyBuyersCare ? (
            <div>
              <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
                Why buyers care
              </p>
              <p className="mt-0.5 text-small text-near-black">
                {signal.whyBuyersCare}
              </p>
            </div>
          ) : null}

          {signal.contentAngles.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {signal.contentAngles.map((angle, index) => (
                <Badge key={`${signal.id}-angle-${index}`} variant="outline">
                  {angle}
                </Badge>
              ))}
            </div>
          ) : null}

          {signal.proofNotes ? (
            <div>
              <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
                Proof notes
              </p>
              <p className="mt-0.5 text-small text-muted-foreground">
                {signal.proofNotes}
              </p>
            </div>
          ) : null}

          {canManage ? (
            <MarketSignalReviewControls
              clientId={clientId}
              signalId={signal.id}
              founderTake={signal.founderTake}
              approvedForIdeas={signal.approvedForIdeas}
            />
          ) : signal.founderTake ? (
            <div>
              <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
                Founder take
              </p>
              <p className="mt-0.5 text-small text-near-black">
                {signal.founderTake}
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 font-mono text-caption text-muted-foreground">
            {signal.confidenceScore !== null ? (
              <span>Confidence {signal.confidenceScore}/10</span>
            ) : null}
            <span>·</span>
            <span>
              {signal.sourceItemCount} source
              {signal.sourceItemCount === 1 ? "" : "s"}
            </span>
            <span>·</span>
            <span>{formatDate(signal.createdAt)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
