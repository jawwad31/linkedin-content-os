import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  canAccess: true,
  canContribute: true,
  article: {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Meta changes lead ad billing",
    url: "https://example.com/meta",
    summary: "Meta now bills lead ads on submissions.",
    source_name: "Example Blog",
    published_at: "2026-10-01T08:00:00Z",
    classification_reason: "Matches your focus on paid social.",
  } as Record<string, unknown> | null,
  existingEntry: null as { id: string } | null,
  insertError: null as { code: string } | null,
  inserted: [] as Record<string, unknown>[],
  audit: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/session", () => ({
  getServerUser: vi.fn(async () => ({ user: state.user })),
}));
vi.mock("@/lib/access/client-access", () => ({
  canAccessClient: vi.fn(async () => state.canAccess),
  canContributeResearch: vi.fn(async () => state.canContribute),
  canUserDeleteBusinessRecords: vi.fn(async () => true),
}));
vi.mock("@/lib/audit/log", () => ({
  writeAuditLog: (...args: unknown[]) => {
    state.audit(...args);
    return Promise.resolve();
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table === "market_signal_items") {
        const chain: Record<string, unknown> = {
          select: () => chain,
          eq: () => chain,
          is: () => chain,
          maybeSingle: async () => ({ data: state.article, error: null }),
        };
        return chain;
      }
      return {
        select: () => {
          const chain: Record<string, unknown> = {
            eq: () => chain,
            is: () => chain,
            maybeSingle: async () => ({ data: state.existingEntry, error: null }),
          };
          return chain;
        },
        insert: (values: Record<string, unknown>) => {
          state.inserted.push(values);
          return {
            select: () => ({
              maybeSingle: async () =>
                state.insertError
                  ? { data: null, error: state.insertError }
                  : { data: { id: "99999999-9999-4999-8999-999999999999" }, error: null },
            }),
          };
        },
      };
    },
  })),
}));

import {
  articleSourceLine,
  articleToEntryFields,
} from "@/features/research/collected-articles/article-entry";
import { CollectedArticlesPanel } from "@/features/research/collected-articles/collected-articles-panel";
import type { CollectedArticle } from "@/features/research/collected-articles/queries";
import { saveArticleToContentBank } from "@/features/research/collected-articles/service";
import { getContentBankPostEligibility } from "@/features/content-bank/post-eligibility";
import type { ContentBankEntry } from "@/features/content-bank/schemas";
import { parseResearchTab, RESEARCH_TABS } from "@/features/research/research-tabs";

const CLIENT = "11111111-1111-4111-8111-111111111111";
const ITEM = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  state.user = { id: "user-1" };
  state.canAccess = true;
  state.canContribute = true;
  state.existingEntry = null;
  state.insertError = null;
  state.inserted = [];
  state.audit.mockClear();
});

describe("article to Content Bank entry", () => {
  const article = {
    title: "Meta changes lead ad billing",
    url: "https://example.com/meta",
    summary: "Meta now bills lead ads on submissions.",
    sourceName: "Example Blog",
    publishedAt: "2026-10-01T08:00:00Z",
    classificationReason: "Matches your focus on paid social.",
  };

  it("keeps the link, source and date as the proof and uses the classifier's reason", () => {
    const fields = articleToEntryFields(article);
    expect(fields.title).toBe("Meta changes lead ad billing");
    expect(fields.whatHappened).toContain("Meta now bills lead ads on submissions.");
    expect(fields.whatHappened).toContain(articleSourceLine(article));
    expect(articleSourceLine(article)).toBe(
      "- Meta changes lead ad billing (Example Blog, published 2026-10-01): https://example.com/meta",
    );
    expect(fields.whyItMatters).toBe("Matches your focus on paid social.");
    expect(fields.whatWasLearned).toBe("Matches your focus on paid social.");
  });

  it("invents nothing when the article has no summary or reason", () => {
    const fields = articleToEntryFields({ ...article, summary: null, classificationReason: null, publishedAt: null, sourceName: null });
    expect(fields.whatChanged).toBeNull();
    expect(fields.whyItMatters).toBeNull();
    expect(fields.whatHappened).toContain("date not reported");
    expect(fields.whatWasLearned).toContain("Add your own take");
  });

  it("clips long text to the Content Bank field limit", () => {
    const fields = articleToEntryFields({ ...article, summary: "x".repeat(5000), title: "t".repeat(500) });
    expect(fields.title.length).toBeLessThanOrEqual(200);
    expect(fields.whatHappened.length).toBeLessThanOrEqual(2000);
    expect(fields.whatChanged!.length).toBeLessThanOrEqual(2000);
  });
});

describe("saveArticleToContentBank", () => {
  it("creates a reusable, ready trend reaction linked to the article and records it", async () => {
    const result = await saveArticleToContentBank(CLIENT, ITEM);
    expect(result).toMatchObject({ ok: true, data: { alreadySaved: false } });
    expect(state.inserted).toHaveLength(1);
    expect(state.inserted[0]).toMatchObject({
      client_id: CLIENT,
      entry_type: "trend_reaction",
      source_article_id: ITEM,
      readiness: "ready",
      allow_reuse: true,
    });
    expect(state.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "content_bank_entry_created",
        metadata: expect.objectContaining({ origin: "collected_article", articleId: ITEM }),
      }),
    );
  });

  it("returns the entry that already exists instead of making a second one", async () => {
    state.existingEntry = { id: "55555555-5555-4555-8555-555555555555" };
    const result = await saveArticleToContentBank(CLIENT, ITEM);
    expect(result).toMatchObject({ ok: true, data: { entryId: state.existingEntry.id, alreadySaved: true } });
    expect(state.inserted).toHaveLength(0);
  });

  it("refuses someone without the Research capability, and nobody signed in", async () => {
    state.canContribute = false;
    expect(await saveArticleToContentBank(CLIENT, ITEM)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    state.canContribute = true;
    state.user = null;
    expect(await saveArticleToContentBank(CLIENT, ITEM)).toMatchObject({ ok: false, code: "AUTH_REQUIRED" });
    expect(state.inserted).toHaveLength(0);
  });

  it("refuses an article that is not in this company, and a malformed id", async () => {
    state.article = null;
    expect(await saveArticleToContentBank(CLIENT, ITEM)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await saveArticleToContentBank(CLIENT, "not-a-uuid")).toMatchObject({ ok: false });
    expect(state.inserted).toHaveLength(0);
  });
});

describe("a saved article in the Content Bank", () => {
  const entry = (extra: Partial<ContentBankEntry>) =>
    ({
      sourceType: "founder_experience",
      entryType: "trend_reaction",
      readiness: "ready",
      allowReuse: true,
      usageStatus: "unused",
      active: true,
      sourceTrendCardId: null,
      sourceResearchFindingId: null,
      sourceArticleId: null,
      ...extra,
    }) as ContentBankEntry;

  it("is eligible to draft from when linked to an article, and not when it has no source", () => {
    expect(getContentBankPostEligibility(entry({ sourceArticleId: ITEM })).eligible).toBe(true);
    expect(getContentBankPostEligibility(entry({})).eligible).toBe(false);
  });
});

describe("the RSS tab list of articles", () => {
  const article = (extra: Partial<CollectedArticle> = {}): CollectedArticle => ({
    id: ITEM,
    title: "Meta changes lead ad billing",
    sourceName: "Example Blog",
    status: "relevant",
    relevanceScore: 8,
    classificationReason: "Matches your focus.",
    publishedAt: "2026-10-01T08:00:00Z",
    url: "https://example.com/meta",
    contentBankEntryId: null,
    ...extra,
  });
  const render = (
    articles: CollectedArticle[],
    role: "client_admin" | "client_user" = "client_admin",
    permissions: ("research_contribute" | "ideas_manage" | "posts_draft")[] = [],
  ) =>
    renderToStaticMarkup(
      createElement(CollectedArticlesPanel, {
        clientId: CLIENT,
        role,
        permissions,
        articles,
        activeStatus: "all",
        counts: null,
        pagination: { page: 1, pageSize: 25, total: articles.length, totalPages: 1 },
      }),
    );

  it("offers Save to Content Bank on an unsaved article", () => {
    const html = render([article()]);
    expect(html).toContain("Save to Content Bank");
    expect(html).not.toContain("Reusable, unused");
  });

  it("shows the saved state with next steps on a saved article", () => {
    const html = render([article({ contentBankEntryId: "33333333-3333-4333-8333-333333333333" })]);
    expect(html).toContain("This article is in the Content Bank as a trend reaction");
    expect(html).toContain("Create post");
    expect(html).toContain("Add to Calendar");
    expect(html).toContain(`/client/${CLIENT}/posts/new?sourceType=founder_experience&amp;sourceId=33333333-3333-4333-8333-333333333333`);
  });

  it("shows Save disabled, with the reason, to someone without Research", () => {
    const html = render([article()], "client_user", ["posts_draft"]);
    expect(html).toMatch(/<button[^>]*\sdisabled=""[^>]*>(?:(?!<\/button>)[\s\S])*Save to Content Bank/);
    expect(html).toContain("You cannot save articles to the Content Bank.");
  });

  it("keeps the RSS tab in its filter and page links, and no longer talks about TrendCards", () => {
    const html = render([article()]);
    expect(html).toContain("tab=rss");
    expect(html).not.toMatch(/TrendCard/);
  });
});

describe("research tabs", () => {
  it("are Web research, RSS feeds and Run history, and old tab links land on RSS feeds", () => {
    expect(RESEARCH_TABS.map((tab) => tab.label)).toEqual(["Web research", "RSS feeds", "Run history"]);
    for (const old of ["focus", "articles", "trendcards"]) expect(parseResearchTab(old)).toBe("rss");
    expect(parseResearchTab("rss")).toBe("rss");
    expect(parseResearchTab("runs")).toBe("runs");
    expect(parseResearchTab(undefined)).toBe("briefings");
    expect(parseResearchTab("anything-else")).toBe("briefings");
  });
});
