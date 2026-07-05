import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  FileClock,
  Layers,
  Lightbulb,
  type LucideIcon,
  Radar,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

import type { DashboardMetrics } from "./queries";

const RUN_STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  running: "Running",
  success: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const RUN_STATUS_BADGE_VARIANT: Record<
  string,
  "neutral" | "info" | "success" | "danger"
> = {
  queued: "neutral",
  running: "info",
  success: "success",
  failed: "danger",
  cancelled: "neutral",
};

function formatDateTime(value: string) {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MetricIcon({
  icon: Icon,
  tint,
}: {
  icon: LucideIcon;
  tint: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-control",
        tint,
      )}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

function MetricCard({
  title,
  value,
  icon,
  tint,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  value: number;
  icon: LucideIcon;
  tint: string;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <Card className="transition-transform duration-150 hover:-translate-y-0.5">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardDescription>{title}</CardDescription>
          <MetricIcon icon={icon} tint={tint} />
        </div>
        <CardTitle className="font-mono text-3xl">{value}</CardTitle>
      </CardHeader>
      {ctaHref && ctaLabel ? (
        <CardContent>
          <Link
            href={ctaHref}
            className="rounded-control text-small font-medium text-brand-orange hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2"
          >
            {ctaLabel}
          </Link>
        </CardContent>
      ) : null}
    </Card>
  );
}

export function DashboardView({
  clientId,
  metrics,
}: {
  clientId: string;
  metrics: DashboardMetrics;
}) {
  const {
    clientName,
    setupCompleteness,
    latestResearchRun,
    collectedArticlesCount,
    marketSignalsCount,
    ideasCount,
    postsNeedingReviewCount,
    approvedPostsCount,
  } = metrics;

  const setupIncomplete = setupCompleteness.completed < setupCompleteness.total;
  const researchEmpty = collectedArticlesCount === 0 && marketSignalsCount === 0;
  const ideasEmpty = ideasCount === 0;

  const everythingEmpty =
    latestResearchRun === null &&
    collectedArticlesCount === 0 &&
    marketSignalsCount === 0 &&
    ideasCount === 0 &&
    postsNeedingReviewCount === 0 &&
    approvedPostsCount === 0;

  // A single, real-state-driven "what's next" action. Priority mirrors the
  // Setup -> Research -> Ideas -> Publish workflow order from AGENTS.md.
  let statusMessage: string;
  let nextAction: { label: string; href: string } | null = null;

  if (setupIncomplete) {
    statusMessage =
      "Finish setting up business context to improve research and ideas.";
    nextAction = {
      label: "Complete setup",
      href: `/client/${clientId}/settings`,
    };
  } else if (researchEmpty) {
    statusMessage = "No research collected yet for this client.";
    nextAction = { label: "Open research", href: `/client/${clientId}/research` };
  } else if (ideasEmpty) {
    statusMessage = "Research is in. Ready to generate content ideas.";
    nextAction = { label: "Open ideas", href: `/client/${clientId}/ideas` };
  } else if (postsNeedingReviewCount > 0) {
    statusMessage = `${postsNeedingReviewCount} post${postsNeedingReviewCount === 1 ? "" : "s"} waiting for review.`;
  } else if (approvedPostsCount > 0) {
    statusMessage = `${approvedPostsCount} post${approvedPostsCount === 1 ? "" : "s"} approved and ready to publish.`;
    nextAction = { label: "Open publish queue", href: `/client/${clientId}/publish` };
  } else {
    statusMessage = "This client is fully caught up.";
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 rounded-card bg-near-black p-6 text-soft-white lg:flex-row lg:items-center lg:justify-between lg:p-8">
        <div className="min-w-0">
          <p className="text-caption font-mono uppercase tracking-wide text-soft-white/50">
            Dashboard
          </p>
          <h1 className="mt-1 truncate text-card-title font-heading font-semibold">
            {clientName ?? "This client"}
          </h1>
          <p className="mt-1 text-small text-soft-white/70">{statusMessage}</p>
        </div>
        {nextAction ? (
          <Link
            href={nextAction.href}
            className="inline-flex shrink-0 items-center gap-2 rounded-btn bg-gradient-brand px-4 py-2 text-small font-medium text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2 focus-visible:ring-offset-near-black"
          >
            {nextAction.label}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle>Setup completeness</CardTitle>
              <MetricIcon
                icon={SlidersHorizontal}
                tint="bg-brand-orange/10 text-brand-orange"
              />
            </div>
            <CardDescription>
              {setupCompleteness.completed} of {setupCompleteness.total}{" "}
              business context fields complete.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <span className="font-mono text-3xl">
              {setupCompleteness.percent}%
            </span>
            <div
              role="progressbar"
              aria-label="Setup completeness"
              aria-valuenow={setupCompleteness.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              className="h-2 w-full rounded-full bg-soft-white"
            >
              <div
                className="h-2 rounded-full bg-gradient-brand transition-all duration-500"
                style={{ width: `${setupCompleteness.percent}%` }}
              />
            </div>
            {setupIncomplete ? (
              <Link
                href={`/client/${clientId}/settings`}
                className="rounded-control text-small font-medium text-brand-orange hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2"
              >
                Complete setup
              </Link>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle>Latest research run</CardTitle>
              <MetricIcon
                icon={Radar}
                tint="bg-brand-purple/10 text-brand-purple"
              />
            </div>
            <CardDescription>
              Most recent manual or worker research run for this client.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {latestResearchRun ? (
              <>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      RUN_STATUS_BADGE_VARIANT[latestResearchRun.status] ??
                      "neutral"
                    }
                  >
                    {RUN_STATUS_LABELS[latestResearchRun.status] ??
                      latestResearchRun.status}
                  </Badge>
                  {latestResearchRun.stage ? (
                    <span className="text-small text-muted-foreground">
                      {latestResearchRun.stage}
                    </span>
                  ) : null}
                </div>
                <span className="font-mono text-caption text-muted-foreground">
                  {formatDateTime(latestResearchRun.timestamp)}
                </span>
              </>
            ) : (
              <p className="text-small text-muted-foreground">
                No research runs yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          title="Collected Articles"
          value={collectedArticlesCount}
          icon={Layers}
          tint="bg-info/10 text-info"
          ctaHref={researchEmpty ? `/client/${clientId}/research` : undefined}
          ctaLabel={researchEmpty ? "Open research" : undefined}
        />
        <MetricCard
          title="Market Signals"
          value={marketSignalsCount}
          icon={TrendingUp}
          tint="bg-warning/10 text-warning"
          ctaHref={researchEmpty ? `/client/${clientId}/research` : undefined}
          ctaLabel={researchEmpty ? "Open research" : undefined}
        />
        <MetricCard
          title="Ideas"
          value={ideasCount}
          icon={Lightbulb}
          tint="bg-success/10 text-success"
          ctaHref={ideasEmpty ? `/client/${clientId}/ideas` : undefined}
          ctaLabel={ideasEmpty ? "Open ideas" : undefined}
        />
        <MetricCard
          title="Posts needing review"
          value={postsNeedingReviewCount}
          icon={FileClock}
          tint="bg-warning/10 text-warning"
        />
        <MetricCard
          title="Approved posts"
          value={approvedPostsCount}
          icon={CheckCircle2}
          tint="bg-success/10 text-success"
          ctaHref={approvedPostsCount > 0 ? `/client/${clientId}/publish` : undefined}
          ctaLabel={approvedPostsCount > 0 ? "Open publish queue" : undefined}
        />
      </div>

      {everythingEmpty ? (
        <div className="rounded-card border border-border-grey bg-white p-8 text-center">
          <p className="text-body font-medium">
            Nothing here yet for this client.
          </p>
          <p className="mt-1 text-small text-muted-foreground">
            Complete setup and run research to start building Market Signals,
            Ideas, and Posts.
          </p>
        </div>
      ) : null}
    </div>
  );
}
