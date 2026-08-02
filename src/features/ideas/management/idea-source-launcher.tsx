import { Badge } from "@/components/ui/badge";
import {
  REACTION_TYPE_LABELS,
  type ReactionType,
} from "@/features/research/trend-cards/schemas";
import {
  canRoleManageIdeas,
  type ClientPermission,
  type EffectiveClientRole,
} from "@/lib/access/roles";
import { formatDateOnly, formatUtcDate } from "@/lib/format/date";
import { Children, type ReactNode } from "react";

import { IdeaSourceGenerateButton } from "./idea-source-generate-button";
import type {
  ApprovedTrendCardSource,
  FounderExperienceSource,
  IdeaSourceMode,
  IdeaSources,
  TrendReactionSource,
} from "./source-queries";

function formatWeekOf(value: string | null): string | null {
  if (!value) return null;
  return formatDateOnly(value);
}

function SourceText({
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
      <p className="mt-0.5 line-clamp-3 break-words text-small text-near-black">
        {value}
      </p>
    </div>
  );
}

function EmptySourceMessage({ children }: { children: string }) {
  return (
    <p className="rounded-control border border-dashed border-border-grey bg-soft-white px-3 py-2 text-small text-muted-foreground">
      {children}
    </p>
  );
}

function SourceCard({
  title,
  badge,
  mode,
  sourceId,
  clientId,
  canGenerate,
  children,
}: {
  title: string;
  badge: string;
  mode: IdeaSourceMode;
  sourceId: string;
  clientId: string;
  canGenerate: boolean;
  children: ReactNode;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-control border border-border-grey bg-soft-white p-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <Badge variant="accent-purple">{badge}</Badge>
          </div>
          <h3 className="break-words text-small font-semibold text-near-black">
            {title}
          </h3>
        </div>

        {canGenerate ? (
        <div className="sm:shrink-0">
            <IdeaSourceGenerateButton
              clientId={clientId}
              mode={mode}
              sourceId={sourceId}
            />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{children}</div>
    </article>
  );
}

function ApprovedTrendCardsGroup({
  clientId,
  canGenerate,
  sources,
}: {
  clientId: string;
  canGenerate: boolean;
  sources: ApprovedTrendCardSource[];
}) {
  return (
    <SourceGroup
      title="Approved TrendCards"
      emptyMessage="Approve TrendCards from Research before generating ideas from market shifts."
    >
      {sources.map((source) => (
        <SourceCard
          key={source.id}
          title={source.title}
          badge="TrendCard"
          mode="trend_card"
          sourceId={source.id}
          clientId={clientId}
          canGenerate={canGenerate}
        >
          <SourceText label="Shift" value={source.shift} />
          <SourceText label="Content angle" value={source.contentAngle} />
          {source.weekOf ? (
            <SourceText label="Week of" value={formatWeekOf(source.weekOf)} />
          ) : null}
          {source.confidenceScore !== null ? (
            <SourceText
              label="Confidence"
              value={`${source.confidenceScore}/10`}
            />
          ) : null}
        </SourceCard>
      ))}
    </SourceGroup>
  );
}

function FounderExperiencesGroup({
  clientId,
  canGenerate,
  sources,
}: {
  clientId: string;
  canGenerate: boolean;
  sources: FounderExperienceSource[];
}) {
  return (
    <SourceGroup
      title="Founder Experiences"
      emptyMessage="Add Founder Experiences to generate ideas from lived operator insight."
    >
      {sources.map((source) => (
        <SourceCard
          key={source.id}
          title={source.title}
          badge="Founder Experience"
          mode="founder_experience"
          sourceId={source.id}
          clientId={clientId}
          canGenerate={canGenerate}
        >
          <SourceText label="What happened" value={source.whatHappened} />
          <SourceText label="What was learned" value={source.whatWasLearned} />
          <SourceText label="What changed" value={source.whatChanged} />
          <SourceText label="Why it matters" value={source.whyItMatters} />
            <SourceText label="Created" value={formatUtcDate(source.createdAt)} />
        </SourceCard>
      ))}
    </SourceGroup>
  );
}

function TrendReactionsGroup({
  clientId,
  canGenerate,
  sources,
}: {
  clientId: string;
  canGenerate: boolean;
  sources: TrendReactionSource[];
}) {
  return (
    <SourceGroup
      title="Trend Reactions"
      emptyMessage="React to a TrendCard in Research to generate ideas from your point of view."
    >
      {sources.map((source) => (
        <SourceCard
          key={source.id}
          title={source.title}
          badge="Trend Reaction"
          mode="trend_reaction"
          sourceId={source.id}
          clientId={clientId}
          canGenerate={canGenerate}
        >
          <SourceText
            label="Reaction type"
            value={
              source.reactionType
                ? (REACTION_TYPE_LABELS[source.reactionType as ReactionType] ??
                  source.reactionType)
                : null
            }
          />
          <SourceText label="Take" value={source.take} />
          <SourceText label="Proof or example" value={source.proofOrExample} />
          <SourceText
            label="Linked TrendCard"
            value={source.linkedTrendCardTitle}
          />
          <SourceText label="Created" value={formatUtcDate(source.createdAt)} />
        </SourceCard>
      ))}
    </SourceGroup>
  );
}

function SourceGroup({
  title,
  emptyMessage,
  children,
}: {
  title: string;
  emptyMessage: string;
  children: ReactNode;
}) {
  const childList = Children.toArray(children);

  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-heading text-body font-semibold text-near-black">
          {title}
        </h3>
        <Badge variant="neutral">{childList.length}</Badge>
      </div>

      {childList.length > 0 ? (
        <div className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto pr-1">
          {childList}
        </div>
      ) : (
        <EmptySourceMessage>{emptyMessage}</EmptySourceMessage>
      )}
    </section>
  );
}

export function IdeaSourceLauncher({
  clientId,
  role,
  permissions,
  sources,
}: {
  clientId: string;
  role: EffectiveClientRole;
  permissions: ClientPermission[];
  sources: IdeaSources;
}) {
  const canGenerate = canRoleManageIdeas(role, permissions);

  return (
    <div className="flex flex-col gap-5">
      {!canGenerate ? (
        <p className="rounded-control border border-border-grey bg-soft-white px-3 py-2 text-small font-medium text-muted-foreground">
          You do not have permission to generate ideas for this Client
          Workspace.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <ApprovedTrendCardsGroup
          clientId={clientId}
          canGenerate={canGenerate}
          sources={sources.approvedTrendCards}
        />
        <FounderExperiencesGroup
          clientId={clientId}
          canGenerate={canGenerate}
          sources={sources.founderExperiences}
        />
        <TrendReactionsGroup
          clientId={clientId}
          canGenerate={canGenerate}
          sources={sources.trendReactions}
        />
      </div>
    </div>
  );
}
