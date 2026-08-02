"use client";

import { ChevronRight, Lightbulb, FileText } from "lucide-react";
import Link from "next/link";

import {
  BulkDeleteControls,
  useBulkSelection,
} from "@/components/shared/bulk-delete-controls";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BeliefShiftDisplay } from "@/components/shared/belief-shift-display";
import {
  canRoleDraftPosts,
  canRoleManageIdeas,
  canRoleManageWorkflowReview,
  type ClientPermission,
  type EffectiveClientRole,
} from "@/lib/access/roles";
import { formatUtcDate } from "@/lib/format/date";
import { cn } from "@/lib/utils";

import { FounderDirectionControls, IdeaDeleteButton } from "./founder-direction-controls";
import { GeneratePostButton } from "./generate-post-button";
import { StrategyOverridesControls } from "./strategy-overrides-controls";
import type { ContentIdea, ContentIdeaStatus } from "./queries";
import type { ContentResource } from "@/features/resources/queries";

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

function titleCase(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function ContentIdeasPanel({
  clientId,
  role,
  permissions,
  ideas,
  resources,
}: {
  clientId: string;
  role: EffectiveClientRole;
  permissions: ClientPermission[];
  ideas: ContentIdea[];
  resources: ContentResource[];
}) {
  const canManage = canRoleManageIdeas(role, permissions);
  const canDraft = canRoleDraftPosts(role, permissions);
  const canDelete = canRoleManageWorkflowReview(role);
  const selection = useBulkSelection(ideas.map((idea) => idea.id));

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
      {canDelete ? (
        <BulkDeleteControls
          clientId={clientId}
          entityType="content_idea"
          recordLabel="Content Idea"
          pluralLabel="Content Ideas"
          visibleCount={ideas.length}
          selection={selection}
        />
      ) : null}
      {ideas.map((idea) => {
        const canGeneratePost =
          canDraft && idea.status === "ready" && !idea.existingPostId;
        const hasAngleControl = Boolean(idea.beliefShift || idea.angleBoundary);
        const hasSourceDetail = Boolean(
          idea.sourceTitle || idea.sourceContext || idea.proofNotes,
        );

        return (
          <article
            key={idea.id}
            className={cn(
              "flex flex-col gap-3 rounded-card border border-border-grey bg-white p-4 transition-colors",
              selection.isSelected(idea.id) &&
                "border-brand-purple/50 bg-brand-purple/5 ring-1 ring-brand-purple/20",
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              {canDelete && selection.isSelectionMode ? (
                <input
                  type="checkbox"
                  checked={selection.isSelected(idea.id)}
                  onChange={(event) =>
                    selection.toggle(
                      idea.id,
                      (event.nativeEvent as MouseEvent).shiftKey,
                    )
                  }
                  className="mr-1 h-4 w-4 shrink-0 rounded border-border-grey accent-brand-purple"
                  aria-label={`Select Content Idea: ${idea.angle}`}
                />
              ) : null}
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
                  Theme: {idea.contentPillar}
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

            {idea.generationPlan ? (
              <div className="rounded-control border border-brand-purple/20 bg-brand-purple/5 p-3">
                <p className="text-caption font-medium uppercase tracking-wide text-brand-purple">
                  Generated Strategy
                </p>
                <p className="mt-1 text-small font-medium text-near-black">
                  {idea.generationPlan.strategy.coreArgument}
                </p>
                <div className="mt-2 grid grid-cols-1 gap-2 text-small sm:grid-cols-2">
                  <p>
                    <span className="text-muted-foreground">Target: </span>
                    {idea.generationPlan.strategy.targetIcp}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Angle: </span>
                    {titleCase(idea.generationPlan.strategy.angleType)}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Belief: </span>
                    {idea.generationPlan.strategy.currentBelief} to{" "}
                    {idea.generationPlan.strategy.desiredBelief}
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 rounded-control border border-brand-purple/15 bg-white/70 p-3 sm:grid-cols-2">
                  <IdeaField
                    label="Primary source anchor"
                    value={idea.generationPlan.strategy.primarySourceAnchor}
                  />
                  <IdeaField
                    label="Proof to use"
                    value={idea.generationPlan.strategy.proofToUse.join("\n")}
                  />
                  <IdeaField
                    label="Risk notes"
                    value={idea.generationPlan.strategy.riskNotes.join("\n")}
                  />
                  <p className="text-small">
                    <span className="text-muted-foreground">Readiness: </span>
                    {titleCase(idea.generationPlan.strategy.readiness)}
                  </p>
                </div>
                <details className="group mt-3 rounded-control border border-brand-purple/15 bg-white/70">
                  <summary className="flex cursor-pointer select-none list-none items-center justify-between p-3 text-caption font-medium uppercase tracking-wide text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                    <span>Execution details</span>
                    <ChevronRight
                      aria-hidden="true"
                      className="h-4 w-4 transition-transform group-open:rotate-90"
                    />
                  </summary>
                  <div className="grid grid-cols-1 gap-3 px-3 pb-3 text-small sm:grid-cols-2">
                    <IdeaField
                      label="Argument outline"
                      value={idea.generationPlan.execution.argumentOutline.join("\n")}
                    />
                    <p>
                      <span className="text-muted-foreground">Archetype: </span>
                      {titleCase(
                        idea.generationPlan.execution.contentArchetype,
                      )}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Structure: </span>
                      {titleCase(idea.generationPlan.execution.postStructure)}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Framework: </span>
                      {titleCase(idea.generationPlan.execution.bodyFramework)}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Hook: </span>
                      {titleCase(idea.generationPlan.execution.hookType)}
                    </p>
                    <p>
                      <span className="text-muted-foreground">CTA: </span>
                      {titleCase(idea.generationPlan.execution.ctaType)}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Resource: </span>
                      {idea.generationPlan.execution.resourceId
                        ? "Selected"
                        : "None"}
                    </p>
                  </div>
                </details>
              </div>
            ) : (
              <p className="rounded-control bg-soft-white p-3 text-small text-muted-foreground">
                This older idea has no stored strategy yet. It will be planned
                before its post is drafted.
              </p>
            )}

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

            {canManage && !selection.isSelectionMode ? (
              <FounderDirectionControls
                clientId={clientId}
                ideaId={idea.id}
                founderDirection={idea.founderDirection}
              />
            ) : !canManage ? (
              <ReadOnlyDirection value={idea.founderDirection} />
            ) : null}

            {canManage &&
            !selection.isSelectionMode &&
            !idea.existingPostId &&
            (idea.status === "draft" || idea.status === "ready") ? (
              <StrategyOverridesControls
                clientId={clientId}
                ideaId={idea.id}
                overrides={idea.strategyOverrides}
                resources={resources}
              />
            ) : null}

            {!selection.isSelectionMode ? (
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
                      className={buttonVariants({
                        variant: "outline",
                        size: "sm",
                      })}
                    >
                      <FileText aria-hidden="true" className="h-4 w-4" />
                      Open Post
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
