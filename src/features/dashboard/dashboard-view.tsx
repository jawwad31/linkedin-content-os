import Link from "next/link";
import {
  ArrowRight,
  Inbox,
  Layers,
  Lightbulb,
  type LucideIcon,
  Radar,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { formatResearchRunStage } from "@/features/research/research-runs/types";
import { formatUtcDateTime } from "@/lib/format/date";
import { cn } from "@/lib/utils";

import type { EffectiveClientRole } from "@/lib/access/roles";
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
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-control",
        tint,
      )}
    >
      <Icon className="h-5 w-5" />
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
    <Card className="hover-lift">
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
  role,
}: {
  clientId: string;
  metrics: DashboardMetrics;
  role: EffectiveClientRole;
}) {
  const {
    clientName,
    setupCompleteness,
    latestResearchRun,
    collectedArticlesCount,
    trendCardsCount,
    ideasCount,
    postsNeedingReviewCount,
    approvedPostsCount,
  } = metrics;

  const setupIncomplete = setupCompleteness.completed < setupCompleteness.total;
  const researchEmpty = collectedArticlesCount === 0 && trendCardsCount === 0;
  const ideasEmpty = ideasCount === 0;

  const everythingEmpty =
    latestResearchRun === null &&
    collectedArticlesCount === 0 &&
    trendCardsCount === 0 &&
    ideasCount === 0 &&
    postsNeedingReviewCount === 0 &&
    approvedPostsCount === 0;

  // A single, real-state-driven "what's next" action.
  // Rules for role-aware and permission-safe CTA resolution.
  let statusMessage: string;
  let nextAction: { label: string; href: string } | null = null;

  const isUserAdmin = role === "agency_admin" || role === "client_admin";

  if (isUserAdmin) {
    if (latestResearchRun?.status === "failed") {
      statusMessage = "Research requires attention.";
      nextAction = {
        label: "Open research",
        href: `/client/${clientId}/research`,
      };
    } else if (postsNeedingReviewCount > 0) {
      statusMessage = `${postsNeedingReviewCount} post${postsNeedingReviewCount === 1 ? "" : "s"} waiting for review.`;
      nextAction = {
        label: "Review posts",
        href: `/client/${clientId}/posts`,
      };
    } else if (approvedPostsCount > 0) {
      statusMessage = `${approvedPostsCount} post${approvedPostsCount === 1 ? "" : "s"} approved and ready to publish.`;
      nextAction = {
        label: "Open publish queue",
        href: `/client/${clientId}/publish`,
      };
    } else if (setupIncomplete) {
      statusMessage = "Finish setting up business context to improve research and ideas.";
      nextAction = {
        label: "Complete setup",
        href: `/client/${clientId}/settings`,
      };
    } else if (researchEmpty) {
      statusMessage = "No research collected yet for this client.";
      nextAction = {
        label: "Open research",
        href: `/client/${clientId}/research`,
      };
    } else if (ideasEmpty) {
      statusMessage = "Research is in. Ready to generate content ideas.";
      nextAction = {
        label: "Open ideas",
        href: `/client/${clientId}/ideas`,
      };
    } else {
      statusMessage = "This client is fully caught up.";
    }
  } else {
    // client_user has limited permissions: no setup edits, research runs, post actions
    if (approvedPostsCount > 0) {
      statusMessage = `${approvedPostsCount} post${approvedPostsCount === 1 ? "" : "s"} approved and ready to copy.`;
      nextAction = {
        label: "View approved posts",
        href: `/client/${clientId}/publish`,
      };
    } else if (postsNeedingReviewCount > 0) {
      statusMessage = `${postsNeedingReviewCount} post${postsNeedingReviewCount === 1 ? "" : "s"} awaiting administrator review.`;
      nextAction = {
        label: "View posts",
        href: `/client/${clientId}/posts`,
      };
    } else if (ideasEmpty) {
      statusMessage = "No content ideas generated yet.";
      nextAction = {
        label: "Open ideas",
        href: `/client/${clientId}/ideas`,
      };
    } else if (latestResearchRun?.status === "failed") {
      statusMessage = "Latest research run failed and requires administrator attention.";
    } else if (setupIncomplete) {
      statusMessage = "Business setup is incomplete and requires administrator completion.";
    } else if (researchEmpty) {
      statusMessage = "No research data collected. An administrator must run research.";
    } else {
      statusMessage = "This client is fully caught up.";
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Overview"
        description={`${clientName ?? "This client"} · workspace snapshot`}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="hover-lift">
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

        <MetricCard
          title="Collected Articles"
          value={collectedArticlesCount}
          icon={Layers}
          tint="bg-info/10 text-info"
          ctaHref={researchEmpty ? `/client/${clientId}/research` : undefined}
          ctaLabel={researchEmpty ? "Open research" : undefined}
        />
        <MetricCard
          title="TrendCards"
          value={trendCardsCount}
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
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="hover-lift lg:col-span-2">
          <CardHeader>
            <Badge variant={nextAction ? "accent-orange" : "success"}>
              {nextAction ? "Action needed" : "Fully caught up"}
            </Badge>
            <CardTitle>Next best action</CardTitle>
            <CardDescription>{statusMessage}</CardDescription>
          </CardHeader>
          {nextAction ? (
            <CardFooter>
              <Link
                href={nextAction.href}
                className={cn(buttonVariants({ variant: "gradient" }), "gap-2")}
              >
                {nextAction.label}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </CardFooter>
          ) : null}
        </Card>

        <Card className="hover-lift">
          <CardHeader>
            <CardTitle>Post workflow</CardTitle>
            <CardDescription>Where posts stand right now.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Badge variant="warning">{postsNeedingReviewCount}</Badge>
                <span className="truncate text-small text-near-black">
                  {isUserAdmin ? "Needs review" : "Awaiting admin review"}
                </span>
              </div>
              {postsNeedingReviewCount > 0 ? (
                <Link
                  href={`/client/${clientId}/posts`}
                  className="shrink-0 rounded-control text-small font-medium text-brand-orange hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2"
                >
                  {isUserAdmin ? "Review posts" : "View posts"}
                </Link>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Badge variant="success">{approvedPostsCount}</Badge>
                <span className="truncate text-small text-near-black">
                  {isUserAdmin ? "Approved" : "Ready for publishing"}
                </span>
              </div>
              {approvedPostsCount > 0 ? (
                <Link
                  href={`/client/${clientId}/publish`}
                  className="shrink-0 rounded-control text-small font-medium text-brand-orange hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 focus-visible:ring-offset-2"
                >
                  {isUserAdmin ? "Open publish queue" : "View approved posts"}
                </Link>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="hover-lift">
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
                {formatResearchRunStage(latestResearchRun.stage) ? (
                  <span className="text-small text-muted-foreground">
                    {formatResearchRunStage(latestResearchRun.stage)}
                  </span>
                ) : null}
              </div>
              <span className="font-mono text-caption text-muted-foreground">
                {formatUtcDateTime(latestResearchRun.timestamp)}
              </span>
            </>
          ) : (
            <p className="text-small text-muted-foreground">
              No research runs yet.
            </p>
          )}
        </CardContent>
      </Card>

      {everythingEmpty ? (
        <EmptyState
          icon={Inbox}
          title="Nothing here yet for this client."
          description={statusMessage}
          action={
            nextAction ? (
              <Link
                href={nextAction.href}
                className={cn(buttonVariants({ variant: "secondary", size: "sm" }))}
              >
                {nextAction.label}
              </Link>
            ) : undefined
          }
        />
      ) : null}
    </div>
  );
}
