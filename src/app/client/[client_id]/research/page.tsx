import { redirect } from "next/navigation";
import { getLlmConfig } from "@/lib/llm/config";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { CollectedArticlesPanel } from "@/features/research/collected-articles/collected-articles-panel";
import {
  getCollectedArticleCounts,
  getRecentCollectedArticles,
  parseArticleStatusFilter,
} from "@/features/research/collected-articles/queries";
import {
  parseCollectedArticlePage,
  parseCollectedArticlePageSize,
} from "@/features/research/collected-articles/pagination";
import { getRecentResearchRuns } from "@/features/research/research-runs/queries";
import { getRecentTrendCards } from "@/features/research/trend-cards/queries";
import { TrendCardsPanel } from "@/features/research/trend-cards/trend-cards-panel";
import { ResearchRunsPanel } from "@/features/research/research-runs/research-runs-panel";
import { RunResearchAgentButton } from "@/features/research/run-research-agent/run-research-agent-button";
import { getRssSources } from "@/features/research/rss-sources/queries";
import { RssSourcesPanel } from "@/features/research/rss-sources/rss-sources-panel";
import { canRoleRunResearchAgent } from "@/lib/access/roles";
import { getServerUser } from "@/lib/supabase/session";
import { getCurrentUserAccessForClient } from "@/lib/access/client-access";
import { getResearchKeywords } from "@/features/research/research-keywords/queries";
import { ResearchKeywordsForm } from "@/features/research/research-keywords/research-keywords-form";
import {
  parseResearchTab,
  ResearchTabs,
} from "@/features/research/research-tabs";
import {
  getResearchSettings,
  getWebBriefings,
} from "@/features/research/web-research/queries";
import { ResearchWorkbench } from "@/features/research/web-research/research-workbench";
import { getAutomationView } from "@/features/research/automation/service";
import { AutomationPanel } from "@/features/research/automation/automation-panel";
import { canDraftPosts, canManageIdeas } from "@/lib/access/client-access";

export default async function ResearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ client_id: string }>;
  searchParams: Promise<{
    tab?: string;
    articles?: string;
    article_page?: string;
    article_page_size?: string;
    briefing?: string;
  }>;
}) {
  const { client_id: clientId } = await params;
  const {
    tab: tabParam,
    articles: articlesParam,
    article_page: articlePageParam,
    article_page_size: articlePageSizeParam,
    briefing: briefingParam,
  } = await searchParams;
  const activeTab = parseResearchTab(tabParam);
  const { user } = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const articleStatus = parseArticleStatusFilter(articlesParam);
  const articlePage = parseCollectedArticlePage(articlePageParam);
  const articlePageSize = parseCollectedArticlePageSize(articlePageSizeParam);

  const access = await getCurrentUserAccessForClient(user.id, clientId);
  const role = access?.role ?? null;
  const result = role ? await getRssSources(clientId) : null;
  const runsResult = role ? await getRecentResearchRuns(clientId) : null;
  const articlesResult = role
    ? await getRecentCollectedArticles(
        clientId,
        articleStatus,
        articlePage,
        articlePageSize,
      )
    : null;
  const articleCountsResult = role
    ? await getCollectedArticleCounts(clientId)
    : null;
  const cardsResult = role ? await getRecentTrendCards(clientId) : null;
  const keywordsResult = role ? await getResearchKeywords(clientId) : null;
  const canManage = !!role && canRoleRunResearchAgent(role);
  const webResult =
    activeTab === "briefings" && role
      ? await Promise.allSettled([
          canManage ? getResearchSettings(clientId) : Promise.resolve(null),
          getWebBriefings(clientId, briefingParam),
          Promise.all([
            canDraftPosts(user.id, clientId),
            canManageIdeas(user.id, clientId),
          ]),
          getAutomationView(clientId, canManage),
        ])
      : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Research"
        description="Research your saved prompt, review evidence, and select findings for content."
        action={
          activeTab === "focus" && role && canRoleRunResearchAgent(role) ? (
            <RunResearchAgentButton clientId={clientId} />
          ) : undefined
        }
      />

      <ResearchTabs
        clientId={clientId}
        activeTab={activeTab}
        counts={{
          articles: articleCountsResult?.ok
            ? articleCountsResult.counts.all
            : undefined,
          trendcards: cardsResult?.ok ? cardsResult.cards.length : undefined,
        }}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {activeTab === "briefings" && webResult ? (
          <div className="lg:col-span-2">
            {webResult[3].status === "fulfilled" && webResult[3].value ? (
              <div className="mb-6">
                <AutomationPanel
                  key={`${clientId}:${webResult[3].value.schedule.version}:${webResult[3].value.versions[0]?.id ?? "none"}:${webResult[3].value.sources.map((s) => s.enabled).join()}`}
                  clientId={clientId}
                  view={webResult[3].value}
                />
              </div>
            ) : webResult[3].status === "rejected" ? (
              <p role="alert" className="mb-4 text-small text-danger-strong">
                Research automation could not be loaded. An administrator must
                check its deployment setup.
              </p>
            ) : null}
            {webResult[0].status === "fulfilled" &&
            webResult[1].status === "fulfilled" &&
            webResult[2].status === "fulfilled" ? (
              <ResearchWorkbench
                key={`${clientId}:${webResult[0].value?.revision ?? "member"}`}
                clientId={clientId}
                settings={webResult[0].value}
                briefings={webResult[1].value}
                canManage={canManage}
                canCreatePosts={webResult[2].value.every(Boolean)}
                providerConfigured={!!getLlmConfig("webResearch")}
              />
            ) : (
              <p role="alert" className="text-small text-danger-strong">
                Web research could not be loaded. Refresh and try again; if this
                persists, ask an administrator to check the P07 migration.
                Existing RSS tabs remain available.
              </p>
            )}
          </div>
        ) : null}
        {activeTab === "focus" ? (
          <>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Research Focus</CardTitle>
                <CardDescription>
                  Steers which collected articles are treated as relevant and
                  which become TrendCards. Does not filter RSS collection.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {role && keywordsResult?.ok ? (
                  <ResearchKeywordsForm
                    clientId={clientId}
                    role={role}
                    keywords={keywordsResult.keywords}
                  />
                ) : null}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
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
                    <p className="text-small text-danger-strong">
                      We could not load RSS sources. Please try again.
                    </p>
                  )
                ) : null}
              </CardContent>
            </Card>
          </>
        ) : null}

        {activeTab === "articles" ? (
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
                    permissions={access?.permissions ?? []}
                    articles={articlesResult.articles}
                    activeStatus={articleStatus}
                    pagination={articlesResult.pagination}
                    counts={
                      articleCountsResult?.ok
                        ? articleCountsResult.counts
                        : null
                    }
                  />
                ) : (
                  <p className="text-small text-danger-strong">
                    We could not load collected articles. Please try again.
                  </p>
                )
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {activeTab === "trendcards" ? (
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
                    permissions={access?.permissions ?? []}
                    cards={cardsResult.cards}
                  />
                ) : (
                  <p className="text-small text-danger-strong">
                    We could not load TrendCards. Please try again.
                  </p>
                )
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {activeTab === "runs" ? (
          <Card className="lg:col-span-2">
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
                  <p className="text-small text-danger-strong">
                    We could not load research runs. Please try again.
                  </p>
                )
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
