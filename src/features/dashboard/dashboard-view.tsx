import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

function MetricCard({
  title,
  value,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  value: number;
  ctaHref?: string;
  ctaLabel?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{title}</CardDescription>
        <CardTitle className="font-mono text-3xl">{value}</CardTitle>
      </CardHeader>
      {ctaHref && ctaLabel ? (
        <CardContent>
          <Link
            href={ctaHref}
            className="text-small font-medium text-brand-orange hover:underline"
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

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Setup completeness</CardTitle>
            <CardDescription>
              {setupCompleteness.completed} of {setupCompleteness.total}{" "}
              business context fields complete.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <span className="font-mono text-3xl">
              {setupCompleteness.percent}%
            </span>
            {setupIncomplete ? (
              <Link
                href={`/client/${clientId}/settings`}
                className="text-small font-medium text-brand-orange hover:underline"
              >
                Complete setup
              </Link>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Latest research run</CardTitle>
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
          ctaHref={researchEmpty ? `/client/${clientId}/research` : undefined}
          ctaLabel={researchEmpty ? "Open research" : undefined}
        />
        <MetricCard
          title="Market Signals"
          value={marketSignalsCount}
          ctaHref={researchEmpty ? `/client/${clientId}/research` : undefined}
          ctaLabel={researchEmpty ? "Open research" : undefined}
        />
        <MetricCard
          title="Ideas"
          value={ideasCount}
          ctaHref={ideasEmpty ? `/client/${clientId}/ideas` : undefined}
          ctaLabel={ideasEmpty ? "Open ideas" : undefined}
        />
        <MetricCard
          title="Posts needing review"
          value={postsNeedingReviewCount}
        />
        <MetricCard title="Approved posts" value={approvedPostsCount} />
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
