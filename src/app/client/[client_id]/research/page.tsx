import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUserRoleForClient } from "@/features/clients/invitations/queries";
import { CollectedArticlesPanel } from "@/features/research/collected-articles/collected-articles-panel";
import { getRecentCollectedArticles } from "@/features/research/collected-articles/queries";
import { MarketSignalsPanel } from "@/features/research/market-signals/market-signals-panel";
import { getRecentMarketSignals } from "@/features/research/market-signals/queries";
import { getRecentResearchRuns } from "@/features/research/research-runs/queries";
import { ResearchRunsPanel } from "@/features/research/research-runs/research-runs-panel";
import { RunResearchAgentButton } from "@/features/research/run-research-agent/run-research-agent-button";
import { getRssSources } from "@/features/research/rss-sources/queries";
import { RssSourcesPanel } from "@/features/research/rss-sources/rss-sources-panel";
import { getServerUser } from "@/lib/supabase/session";

export default async function ResearchPage({
  params,
}: {
  params: Promise<{ client_id: string }>;
}) {
  const { client_id: clientId } = await params;
  const { user } = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const role = await getCurrentUserRoleForClient(user.id, clientId);
  const result = role ? await getRssSources(clientId) : null;
  const runsResult = role ? await getRecentResearchRuns(clientId) : null;
  const articlesResult = role ? await getRecentCollectedArticles(clientId) : null;
  const signalsResult = role ? await getRecentMarketSignals(clientId) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Research"
        description="Collect and process market signals for this client."
      />

      <Card>
        <CardHeader>
          <CardTitle>Run Research Agent</CardTitle>
          <CardDescription>
            Collect the latest articles, classify them for ICP relevance,
            then synthesize evidence-backed Market Signals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {role === "owner" || role === "editor" ? (
            <RunResearchAgentButton clientId={clientId} />
          ) : role === "viewer" ? (
            <p className="rounded-control border border-border-grey bg-soft-white px-3 py-2 text-small font-medium text-muted-foreground">
              Your role is view-only for this client.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>RSS Sources</CardTitle>
            <CardDescription>
              Feeds this client&apos;s research pulls from.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {role && result ? (
              result.ok ? (
                <RssSourcesPanel
                  clientId={clientId}
                  role={role}
                  sources={result.sources}
                />
              ) : (
                <p className="text-small text-danger">
                  We could not load RSS sources. Please try again.
                </p>
              )
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Research Runs</CardTitle>
            <CardDescription>
              History of manual and worker research runs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {role && runsResult ? (
              runsResult.ok ? (
                <ResearchRunsPanel runs={runsResult.runs} />
              ) : (
                <p className="text-small text-danger">
                  We could not load research runs. Please try again.
                </p>
              )
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Collected Articles</CardTitle>
            <CardDescription>
              Articles gathered from active RSS sources.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {role && articlesResult ? (
              articlesResult.ok ? (
                <CollectedArticlesPanel articles={articlesResult.articles} />
              ) : (
                <p className="text-small text-danger">
                  We could not load collected articles. Please try again.
                </p>
              )
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Market Signals</CardTitle>
            <CardDescription>
              Evidence-backed signals synthesized from collected articles.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {role && signalsResult ? (
              signalsResult.ok ? (
                <MarketSignalsPanel signals={signalsResult.signals} />
              ) : (
                <p className="text-small text-danger">
                  We could not load Market Signals. Please try again.
                </p>
              )
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
