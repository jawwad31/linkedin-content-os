import { Lightbulb } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { ClientRole } from "@/features/clients/invitations/schemas";

import { FounderDirectionControls } from "./founder-direction-controls";
import type { ContentIdea, ContentIdeaStatus } from "./queries";

const STATUS_LABELS: Record<ContentIdeaStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  used: "Used",
  archived: "Archived",
};

const STATUS_BADGE_VARIANT: Record<
  ContentIdeaStatus,
  "neutral" | "success" | "warning" | "outline"
> = {
  draft: "neutral",
  ready: "success",
  used: "warning",
  archived: "outline",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function IdeaField({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;

  return (
    <div className="min-w-0">
      <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-0.5 whitespace-pre-line break-words text-small text-near-black">
        {value}
      </p>
    </div>
  );
}

function ReadOnlyDirection({ value }: { value: string | null }) {
  return (
    <div className="rounded-control border border-border-grey bg-white p-3">
      <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
        Founder Direction
      </p>
      {value ? (
        <p className="mt-1 whitespace-pre-line break-words text-small text-near-black">
          {value}
        </p>
      ) : (
        <p className="mt-1 text-small text-muted-foreground">
          No Founder Direction has been added yet.
        </p>
      )}
    </div>
  );
}

export function ContentIdeasPanel({
  clientId,
  role,
  ideas,
}: {
  clientId: string;
  role: ClientRole;
  ideas: ContentIdea[];
}) {
  const canManage = role === "owner" || role === "editor";

  if (ideas.length === 0) {
    return (
      <EmptyState
        icon={Lightbulb}
        title="No ideas yet"
        description="Generated Content Ideas will appear here once the Planning Agent has been run from an approved source."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {ideas.map((idea) => (
        <article
          key={idea.id}
          className="flex flex-col gap-4 rounded-card border border-border-grey bg-white p-4"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="accent-purple">{idea.sourceLabel}</Badge>
                <Badge variant={STATUS_BADGE_VARIANT[idea.status]}>
                  {STATUS_LABELS[idea.status] ?? idea.status}
                </Badge>
                <span className="font-mono text-caption text-muted-foreground">
                  {formatDate(idea.createdAt)}
                </span>
              </div>
              <h2 className="break-words font-heading text-card-title text-near-black">
                {idea.angle}
              </h2>
              {idea.contentPillar ? (
                <p className="mt-1 text-small text-muted-foreground">
                  Pillar: {idea.contentPillar}
                </p>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <IdeaField label="Buyer pain" value={idea.buyerPain} />
            <IdeaField
              label="Commercial relevance"
              value={idea.commercialRelevance}
            />
            <IdeaField label="Belief shift" value={idea.beliefShift} />
            <IdeaField label="Angle boundary" value={idea.angleBoundary} />
            <IdeaField label="Source context" value={idea.sourceContext} />
            <IdeaField label="Proof notes" value={idea.proofNotes} />
          </div>

          {idea.sourceTitle ? (
            <div className="rounded-control border border-border-grey bg-soft-white px-3 py-2">
              <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
                Source title
              </p>
              <p className="mt-0.5 break-words text-small text-near-black">
                {idea.sourceTitle}
              </p>
            </div>
          ) : null}

          {canManage ? (
            <FounderDirectionControls
              clientId={clientId}
              ideaId={idea.id}
              founderDirection={idea.founderDirection}
            />
          ) : (
            <ReadOnlyDirection value={idea.founderDirection} />
          )}
        </article>
      ))}
    </div>
  );
}
