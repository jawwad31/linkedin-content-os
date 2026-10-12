import { redirect } from "next/navigation";
import { getLlmConfig } from "@/lib/llm/config";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ListError } from "@/components/ui/list-error";
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
import { ResearchRunsPanel } from "@/features/research/research-runs/research-runs-panel";
import { RunRssFeedsButton } from "@/features/research/run-research-agent/run-rss-feeds-button";
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
import {
  canContributeResearch,
  canDraftPosts,
  canManageIdeas,
} from "@/lib/access/client-access";
import { cannotReason } from "@/lib/access/permission-copy";

const PAGE_DESCRIPTION: Record<"briefings" | "rss" | "runs", string> = {
  briefings:
    "Web research: your saved prompt and live web search. Review the findings and save the ones you want to the Content Bank.",
  rss: "RSS feeds: follow blogs and news sources. Review the collected articles and save the ones you want to the Content Bank.",
  runs: "The history of research runs, from your button presses and the schedule.",
};

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
  // Article filter and page links belong to the RSS tab even if they carry no tab.
  const activeTab = parseResearchTab(
    tabParam ??
      (articlesParam || articlePageParam || articlePageSizeParam
        ? "rss"
        : undefined),
  );
  const { user } = await getServerUser();

  if (!user) {
    redirect("/login");
  }

  const articleStatus = parseArticleStatusFilter(articlesParam);
  const articlePage = parseCollectedArticlePage(articlePageParam);
  const articlePageSize = parseCollectedArticlePageSize(articlePageSizeParam);

  const access = await getCurrentUserAccessForClient(user.id, clientId);
  const role = access?.role ?? null;
  const onRss = activeTab === "rss";
  const result = role && onRss ? await getRssSources(clientId) : null;
  const runsResult =
    role && activeTab === "runs" ? await getRecentResearchRuns(clientId) : null;
  const articlesResult =
    role && onRss
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
  const keywordsResult =
    role && onRss ? await getResearchKeywords(clientId) : null;
  const canManage = !!role && canRoleRunResearchAgent(role);
  const webResult =
    activeTab === "briefings" && role
      ? await Promise.allSettled([
          canManage ? getResearchSettings(clientId) : Promise.resolve(null),
          getWebBriefings(clientId, briefingParam),
          Promise.all([
            canDraftPosts(user.id, clientId),
            canManageIdeas(user.id, clientId),
            canContributeResearch(user.id, clientId),
          ]),
          getAutomationView(clientId, canManage),
        ])
      : null;

  const tabsStrip = (
    <ResearchTabs
      clientId={clientId}
      activeTab={activeTab}
      counts={{
        rss: articleCountsResult?.ok ? articleCountsResult.counts.all : undefined,
      }}
    />
  );

  // The Web research view draws its own header (with Run web research) inside the
  // workbench, which also places the tab strip. If the view cannot load, the plain
  // header and tabs return.
  const briefingsInWorkbench =
    activeTab === "briefings" &&
    webResult !== null &&
    webResult[0].status === "fulfilled" &&
    webResult[1].status === "fulfilled" &&
    webResult[2].status === "fulfilled";
  const automation = webResult?.[3] ?? null;
  const automationView =
    automation?.status === "fulfilled" ? automation.value : null;
  const scheduleSlot = automationView ? (
    <AutomationPanel
      key={`${clientId}:${automationView.schedule.version}:${automationView.versions[0]?.id ?? "none"}:${automationView.sources.map((s) => s.enabled).join()}`}
      clientId={clientId}
      view={automationView}
      part="schedule"
    />
  ) : automation?.status === "rejected" ? (
    <p role="alert" className="text-small text-danger-strong">
      Research automation could not be loaded. An administrator must check its
      deployment setup.
    </p>
  ) : null;
  // The imported article links that web research may also read. Always visible to admins.
  const sourcesSlot = automationView?.canManage ? (
    <AutomationPanel
      key={`sources:${clientId}:${automationView.schedule.version}:${automationView.versions[0]?.id ?? "none"}`}
      clientId={clientId}
      view={automationView}
      part="sources"
    />
  ) : null;

  return (
    <div className="flex flex-col gap-6">
      {briefingsInWorkbench ? null : (
        <PageHeader
          title="Research"
          description={PAGE_DESCRIPTION[activeTab]}
          action={
            onRss && role ? (
              <RunRssFeedsButton
                clientId={clientId}
                canRun={canManage}
                disabledReason={
                  canManage
                    ? null
                    : "You cannot run the RSS feeds. Account admins run them. You can still review and save the collected articles below."
                }
              />
            ) : undefined
          }
        />
      )}

      {briefingsInWorkbench ? null : tabsStrip}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {activeTab === "briefings" && webResult ? (
          <div className="lg:col-span-2">
            {webResult[0].status === "fulfilled" &&
            webResult[1].status === "fulfilled" &&
            webResult[2].status === "fulfilled" ? (
              <ResearchWorkbench
                key={`${clientId}:${webResult[0].value?.revision ?? "member"}`}
                clientId={clientId}
                settings={webResult[0].value}
                briefings={webResult[1].value}
                canManage={canManage}
                canCreatePosts={webResult[2].value[0] && webResult[2].value[1]}
                createPostsReason={cannotReason("create posts", [
                  ...(webResult[2].value[1] ? [] : ["ideas_manage" as const]),
                  ...(webResult[2].value[0] ? [] : ["posts_draft" as const]),
                ])}
                canSave={webResult[2].value[2]}
                saveReason={cannotReason("save findings to the Content Bank", [
                  "research_contribute" as const,
                ])}
                canAddToCalendar={webResult[2].value[1]}
                addToCalendarReason={cannotReason(
                  "add entries to the calendar",
                  ["ideas_manage" as const],
                )}
                providerConfigured={!!getLlmConfig("webResearch")}
                openBriefingId={briefingParam}
                scheduleSlot={scheduleSlot}
                sourcesSlot={sourcesSlot}
                tabsSlot={tabsStrip}
              />
            ) : (
              <ListError />
            )}
          </div>
        ) : null}

        {onRss ? (
          <>
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>RSS feeds</CardTitle>
                <CardDescription>
                  Add the feeds you want to follow. &ldquo;Run RSS feeds&rdquo;
                  fetches new articles and marks each one relevant or not,
                  using your Research Focus below. Web research also reads the
                  recent articles collected here as background.
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
                    <ListError />
                  )
                ) : null}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Research Focus</CardTitle>
                <CardDescription>
                  Steers which collected articles are marked relevant. It does
                  not limit which articles are collected.
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
                <CardTitle>Collected articles</CardTitle>
                <CardDescription>
                  Articles gathered from your feeds. Save the ones you want to
                  the Content Bank, then create a post from them or add them to
                  the Calendar.
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
                    <ListError />
                  )
                ) : null}
              </CardContent>
            </Card>
          </>
        ) : null}

        {activeTab === "runs" ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Research runs</CardTitle>
              <CardDescription>
                History of manual and scheduled research runs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {role && runsResult ? (
                runsResult.ok ? (
                  <ResearchRunsPanel runs={runsResult.runs} />
                ) : (
                  <ListError />
                )
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
