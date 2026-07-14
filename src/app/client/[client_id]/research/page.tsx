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
import {
  getCollectedArticleCounts,
  getRecentCollectedArticles,
  parseArticleStatusFilter,
} from "@/features/research/collected-articles/queries";
import { getRecentResearchRuns } from "@/features/research/research-runs/queries";
import { getRecentTrendCards } from "@/features/research/trend-cards/queries";
import { TrendCardsPanel } from "@/features/research/trend-cards/trend-cards-panel";
import { ResearchRunsPanel } from "@/features/research/research-runs/research-runs-panel";
import { RunResearchAgentButton } from "@/features/research/run-research-agent/run-research-agent-button";
import { getRssSources } from "@/features/research/rss-sources/queries";
import { RssSourcesPanel } from "@/features/research/rss-sources/rss-sources-panel";
import { canRoleRunResearchAgent } from "@/lib/access/roles";
import { getServerUser } from "@/lib/supabase/session";

export default async function ResearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ client_id: string }>;
  searchParams: Promise<{ articles?: string }>;
}) {
  const { client_id: clientId } = await params;
  const { articles: articlesParam } = await searchParams;
  const { user } = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const articleStatus = parseArticleStatusFilter(articlesParam);

  const role = await getCurrentUserRoleForClient(user.id, clientId);
  const result = role ? await getRssSources(clientId) : null;
  const runsResult = role ? await getRecentResearchRuns(clientId) : null;
  const articlesResult = role
    ? await getRecentCollectedArticles(clientId, articleStatus)
    : null;
  const articleCountsResult = role
    ? await getCollectedArticleCounts(clientId)
    : null;
  const cardsResult = role ? await getRecentTrendCards(clientId) : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Research"
        description="Collect and process market signals for this Client Workspace."
        action={
          role && canRoleRunResearchAgent(role) ? (
            <RunResearchAgentButton clientId={clientId} />
          ) : undefined
        }
      />

      {role && !canRoleRunResearchAgent(role) ? (
        <p className="rounded-control border border-border-grey bg-soft-white px-3 py-2 text-small font-medium text-muted-foreground">
          Client Users cannot run the Research Agent.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Collected Articles</CardTitle>
            <CardDescription>
              Articles gathered from active RSS sources.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {role && articlesResult ? (
              articlesResult.ok ? (
                <CollectedArticlesPanel
                  clientId={clientId}
                  role={role}
                  articles={articlesResult.articles}
                  activeStatus={articleStatus}
                  counts={
                    articleCountsResult?.ok ? articleCountsResult.counts : null
                  }
                />
              ) : (
                <p className="text-small text-danger">
                  We could not load collected articles. Please try again.
                </p>
              )
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>TrendCards</CardTitle>
            <CardDescription>
              Evidence-backed TrendCards synthesized from collected articles,
              grouped by week.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {role && cardsResult ? (
              cardsResult.ok ? (
                <TrendCardsPanel
                  clientId={clientId}
                  role={role}
                  cards={cardsResult.cards}
                />
              ) : (
                <p className="text-small text-danger">
                  We could not load TrendCards. Please try again.
                </p>
              )
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>RSS Sources</CardTitle>
            <CardDescription>
              Feeds this Client Workspace&apos;s research pulls from.
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
      </div>
    </div>
  );
}
