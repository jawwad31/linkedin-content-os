"use client";

import { ChevronRight, Lightbulb, FileText } from "lucide-react";
import Link from "next/link";

import {
  BulkDeleteControls,
  useBulkSelection,
} from "@/components/shared/bulk-delete-controls";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BeliefShiftDisplay } from "@/components/shared/belief-shift-display";
import { useCollapsibleCards } from "@/components/shared/use-collapsible-cards";
import {
  canRoleDraftPosts,
  canRoleManageIdeas,
  canRoleManageWorkflowReview,
  type ClientPermission,
  type EffectiveClientRole,
} from "@/lib/access/roles";
import { splitBeliefShift } from "@/lib/format/belief-shift";
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

/** The collapsed-row belief-shift summary: one truncated line, not the full
 * Before/After card (that stays in the expanded Strategy zone). */
function BeliefShiftOneLiner({ value }: { value: string }) {
  const shift = splitBeliefShift(value);
  const text = shift ? `${shift.from} → ${shift.to}` : value;

  return (
    <p className="mt-1 truncate text-small italic text-muted-foreground">
      {text}
    </p>
  );
}

function beliefShiftValue(idea: ContentIdea): string | null {
  if (idea.generationPlan) {
    return `${idea.generationPlan.strategy.currentBelief} -> ${idea.generationPlan.strategy.desiredBelief}`;
  }
  return idea.beliefShift;
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
  const cardState = useCollapsibleCards(`ideas-collapsed:${clientId}`);

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
      <div className="flex flex-wrap items-center gap-2">
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
        <div className="ml-auto flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => cardState.expandAll(ideas.map((idea) => idea.id))}
          >
            Expand all
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => cardState.collapseAll()}
          >
            Collapse all
          </Button>
        </div>
      </div>
      {ideas.map((idea) => {
        const canGeneratePost =
          canDraft && idea.status === "ready" && !idea.existingPostId;
        const isSelected = selection.isSelected(idea.id);
        const expanded = !selection.isSelectionMode && cardState.isExpanded(idea.id);
        const beliefShift = beliefShiftValue(idea);
        const plan = idea.generationPlan;

        function activateHeader() {
          if (selection.isSelectionMode) {
            selection.toggle(idea.id);
          } else {
            cardState.toggle(idea.id);
          }
        }

        return (
          <article
            key={idea.id}
            className={cn(
              "flex flex-col gap-3 rounded-card border border-border-grey bg-white p-4 transition-colors",
              isSelected &&
                "border-brand-purple/50 bg-brand-purple/5 ring-1 ring-brand-purple/20",
            )}
          >
            <div
              role="button"
              tabIndex={0}
              aria-expanded={expanded}
              onClick={activateHeader}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  activateHeader();
                }
              }}
              className="-m-1 flex cursor-pointer flex-col gap-2 rounded-control p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-purple/50"
            >
              <div className="flex flex-wrap items-center gap-2">
                {canDelete && selection.isSelectionMode ? (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onClick={(event) => event.stopPropagation()}
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
                {!selection.isSelectionMode ? (
                  <ChevronRight
                    aria-hidden="true"
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
                      expanded && "rotate-90",
                    )}
                  />
                ) : null}
              </div>

              <div className="min-w-0">
                <h2 className="break-words font-heading text-card-title font-semibold text-near-black">
                  {idea.angle}
                </h2>
                {beliefShift ? <BeliefShiftOneLiner value={beliefShift} /> : null}
              </div>
            </div>

            {expanded ? (
              <>
                {plan ? (
                  <div className="rounded-control border border-brand-purple/20 bg-brand-purple/5 p-3">
                    <p className="text-caption font-medium uppercase tracking-wide text-brand-purple">
                      Core Argument
                    </p>
                    <p className="mt-1 text-small font-medium text-near-black">
                      {plan.strategy.coreArgument}
                    </p>
                    <p className="mt-2 text-small">
                      <span className="text-muted-foreground">Target: </span>
                      {plan.strategy.targetIcp}
                    </p>
                    {beliefShift ? (
                      <div className="mt-2">
                        <BeliefShiftDisplay value={beliefShift} />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <p className="rounded-control bg-soft-white p-3 text-small text-muted-foreground">
                    This older idea has no stored strategy yet. It will be
                    planned before its post is drafted.
                  </p>
                )}

                <div className="grid grid-cols-1 gap-3 rounded-control bg-soft-white p-3 sm:grid-cols-2">
                  <IdeaField label="Buyer Pain" value={idea.buyerPain} />
                  <IdeaField
                    label="Commercial Relevance"
                    value={idea.commercialRelevance}
                    labelClassName="text-brand-purple"
                  />
                </div>

                {plan ? (
                  <>
                    <details className="group rounded-control border border-border-grey open:bg-soft-white/60">
                      <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 p-3 text-caption font-medium uppercase tracking-wide text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                        <span>Strategy</span>
                        <ChevronRight
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-90"
                        />
                      </summary>
                      <div className="grid grid-cols-1 gap-3 px-3 pb-3 sm:grid-cols-2">
                        {idea.sourceTitle ? (
                          <div className="min-w-0 sm:col-span-2">
                            <p className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
                              Source
                            </p>
                            <p className="mt-1 text-small font-medium text-near-black">
                              {idea.sourceTitle}
                            </p>
                          </div>
                        ) : null}
                        <IdeaField
                          label="Primary Source Anchor"
                          value={plan.strategy.primarySourceAnchor}
                        />
                        <IdeaField
                          label="Proof To Use"
                          value={plan.strategy.proofToUse.join("\n")}
                        />
                        <IdeaField
                          label="Risk Notes"
                          value={plan.strategy.riskNotes.join("\n")}
                        />
                        <p className="text-small">
                          <span className="text-muted-foreground">
                            Readiness:{" "}
                          </span>
                          {titleCase(plan.strategy.readiness)}
                        </p>
                      </div>
                    </details>

                    <details className="group rounded-control border border-border-grey open:bg-soft-white/60">
                      <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 p-3 text-caption font-medium uppercase tracking-wide text-muted-foreground marker:content-none [&::-webkit-details-marker]:hidden">
                        <span>How It Will Be Written</span>
                        <ChevronRight
                          aria-hidden="true"
                          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-90"
                        />
                      </summary>
                      <div className="grid grid-cols-1 gap-3 px-3 pb-3 sm:grid-cols-2">
                        <IdeaField
                          label="Argument Outline"
                          value={plan.execution.argumentOutline.join("\n")}
                        />
                        <p className="text-small">
                          <span className="text-muted-foreground">
                            Archetype:{" "}
                          </span>
                          {titleCase(plan.execution.contentArchetype)}
                        </p>
                        <p className="text-small">
                          <span className="text-muted-foreground">
                            Structure:{" "}
                          </span>
                          {titleCase(plan.execution.postStructure)}
                        </p>
                        <p className="text-small">
                          <span className="text-muted-foreground">
                            Framework:{" "}
                          </span>
                          {titleCase(plan.execution.bodyFramework)}
                        </p>
                        <p className="text-small">
                          <span className="text-muted-foreground">Hook: </span>
                          {titleCase(plan.execution.hookType)}
                        </p>
                        <p className="text-small">
                          <span className="text-muted-foreground">CTA: </span>
                          {titleCase(plan.execution.ctaType)}
                        </p>
                        <p className="text-small">
                          <span className="text-muted-foreground">
                            Resource:{" "}
                          </span>
                          {plan.execution.resourceId ? "Selected" : "None"}
                        </p>
                      </div>
                    </details>
                  </>
                ) : (
                  <IdeaField label="Proof Notes" value={idea.proofNotes} />
                )}

                {canManage ? (
                  <FounderDirectionControls
                    clientId={clientId}
                    ideaId={idea.id}
                    founderDirection={idea.founderDirection}
                  />
                ) : (
                  <ReadOnlyDirection value={idea.founderDirection} />
                )}

                {canManage &&
                !idea.existingPostId &&
                (idea.status === "draft" || idea.status === "ready") ? (
                  <StrategyOverridesControls
                    clientId={clientId}
                    ideaId={idea.id}
                    overrides={idea.strategyOverrides}
                    resources={resources}
                  />
                ) : null}
              </>
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
