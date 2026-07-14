import { ChevronRight, Lightbulb, FileText } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BeliefShiftDisplay } from "@/components/shared/belief-shift-display";
import {
  canRoleManageWorkflowReview,
  canRoleMutateClientWorkflow,
  type EffectiveClientRole,
} from "@/lib/access/roles";
import { formatUtcDate } from "@/lib/format/date";

import { FounderDirectionControls, IdeaDeleteButton } from "./founder-direction-controls";
import { GeneratePostButton } from "./generate-post-button";
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

function IdeaField({
  label,
  value,
  labelClassName,
}: {
  label: string;
  value: string | null;
  labelClassName?: string;
}) {
  if (!value) return null;

  return (
    <div className="min-w-0">
      <p
        className={
          "text-caption font-medium uppercase tracking-wide " +
          (labelClassName ?? "text-muted-foreground")
        }
      >
        {label}
      </p>
      <p className="mt-1 whitespace-pre-line break-words text-body text-near-black">
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
  role: EffectiveClientRole;
  ideas: ContentIdea[];
}) {
  const canManage = canRoleMutateClientWorkflow(role);
  const canDelete = canRoleManageWorkflowReview(role);

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
      {ideas.map((idea) => {
        const canGeneratePost =
          canManage && idea.status === "ready" && !idea.existingPostId;
        const hasAngleControl = Boolean(idea.beliefShift || idea.angleBoundary);
        const hasSourceDetail = Boolean(
          idea.sourceTitle || idea.sourceContext || idea.proofNotes,
        );

        return (
          <article
            key={idea.id}
            className="flex flex-col gap-3 rounded-card border border-border-grey bg-white p-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="accent-purple">{idea.sourceLabel}</Badge>
              <Badge variant={STATUS_BADGE_VARIANT[idea.status]}>
                {STATUS_LABELS[idea.status] ?? idea.status}
              </Badge>
              {idea.existingPostId ? (
                <Badge variant="warning">Post Drafted</Badge>
              ) : null}
              <span className="ml-auto font-mono text-caption text-muted-foreground">
                {formatUtcDate(idea.createdAt)}
              </span>
            </div>

            <div>
              <h2 className="break-words font-heading text-card-title font-semibold text-near-black">
                {idea.angle}
              </h2>
              {idea.contentPillar ? (
                <p className="mt-1 text-small text-muted-foreground">
                  Pillar: {idea.contentPillar}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 rounded-control bg-soft-white p-3 sm:grid-cols-2">
              <IdeaField label="Buyer Pain" value={idea.buyerPain} />
              <IdeaField
                label="Commercial Relevance"
                value={idea.commercialRelevance}
                labelClassName="text-brand-purple"
              />
            </div>

            {hasAngleControl ? (
              <details className="group rounded-control border border-border-grey open:bg-soft-white/60">
                <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 p-3 text-caption font-medium uppercase tracking-wide text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                  <span>Angle Control</span>
                  <ChevronRight
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-90"
                  />
                </summary>
                <div className="grid grid-cols-1 gap-3 px-3 pb-3 sm:grid-cols-2">
                  {idea.beliefShift ? (
                    <div className="min-w-0">
                      <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
                        Belief Shift
                      </p>
                      <div className="mt-1">
                        <BeliefShiftDisplay value={idea.beliefShift} />
                      </div>
                    </div>
                  ) : null}
                  <IdeaField label="Angle Boundary" value={idea.angleBoundary} />
                </div>
              </details>
            ) : null}

            {hasSourceDetail ? (
              <details className="group rounded-control border border-border-grey open:bg-soft-white/60">
                <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 p-3 text-caption font-medium uppercase tracking-wide text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                  <span>Why This Idea Exists</span>
                  <ChevronRight
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-90"
                  />
                </summary>
                <div className="flex flex-col gap-3 px-3 pb-3">
                  {idea.sourceTitle ? (
                    <div className="rounded-control bg-soft-white p-3">
                      <p className="text-small font-medium text-near-black">
                        {idea.sourceTitle}
                      </p>
                      {idea.sourceContext ? (
                        <p className="mt-1 whitespace-pre-line break-words text-small text-muted-foreground">
                          {idea.sourceContext}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <IdeaField label="Source context" value={idea.sourceContext} />
                  )}
                  <IdeaField label="Proof Notes" value={idea.proofNotes} />
                </div>
              </details>
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

            <div className="flex flex-wrap items-center gap-2 border-t border-border-grey pt-3">
              {canDelete ? (
                <IdeaDeleteButton
                  clientId={clientId}
                  ideaId={idea.id}
                  ideaAngle={idea.angle}
                />
              ) : null}
              <div className="ml-auto">
                {canGeneratePost ? (
                  <GeneratePostButton clientId={clientId} ideaId={idea.id} />
                ) : idea.existingPostId ? (
                  <Link
                    href={`/client/${clientId}/posts/${idea.existingPostId}/review`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    <FileText aria-hidden="true" className="h-4 w-4" />
                    Open Post
                  </Link>
                ) : null}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
