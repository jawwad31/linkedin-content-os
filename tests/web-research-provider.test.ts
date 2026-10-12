import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mapWebResponse,
  researchWeb,
} from "@/features/research/web-research/provider";
import {
  INITIAL_RESEARCH_PROMPT,
  RESEARCH_BUDGET,
} from "@/features/research/web-research/contracts";
import { researchFinding, webResponse } from "./fixtures/web-research";
import { writeLlmLog } from "@/lib/llm/log";

vi.mock("@/lib/llm/log", () => ({ writeLlmLog: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const now = new Date("2026-10-08T08:00:00Z");
describe("P07 bounded search and evidence mapping", () => {
  it("uses imported source provenance and preserves its actual fetched date", () => {
    const source = researchFinding.sources[0];
    const imported = [
      {
        id: "85284621-181c-41ac-bf9b-a489feef4c63",
        url: source.url,
        title: source.title,
        text: "Actual imported primary source text.",
        contentHash: "abc",
        fetchedAt: "2026-10-07T08:00:00Z",
      },
    ];
    const result = mapWebResponse(
      webResponse([researchFinding], []),
      [],
      now,
      imported,
    );
    expect(result.findings).toHaveLength(1);
    expect(result.candidates[0].fetchedAt).toBe(imported[0].fetchedAt);
  });
  it("retains every consulted candidate, uses date evidence, and never substitutes fetch dates", () => {
    const source = { ...researchFinding.sources[0], dateEvidence: null };
    const response = webResponse(
      [{ ...researchFinding, sources: [source] }],
      [
        { url: source.url, title: source.title },
        { url: "https://example.org/not-selected", title: "Other candidate" },
      ],
    );
    const result = mapWebResponse(response, [], now);
    expect(result.outcome).toBe("success");
    expect(result.candidates).toHaveLength(2);
    expect(result.findings[0].sources[0]).toMatchObject({
      publishedOn: null,
      effectiveOn: null,
    });
    expect(result.candidates[0].fetchedAt).toBe(now.toISOString());
  });
  it("rejects invented citations, invalid dates, and confirmed changes without primary evidence", () => {
    const invented = {
      ...researchFinding,
      sources: [
        {
          ...researchFinding.sources[0],
          url: "https://invented.example/release",
        },
      ],
    };
    const badDate = {
      ...researchFinding,
      sources: [{ ...researchFinding.sources[0], publishedOn: "2026-02-30" }],
    };
    const secondary = {
      ...researchFinding,
      sources: [{ ...researchFinding.sources[0], sourceKind: "secondary" }],
    };
    const result = mapWebResponse(
      webResponse([invented, badDate, secondary]),
      [],
      now,
    );
    expect(result.outcome).toBe("partial");
    expect(result.findings).toHaveLength(0);
    expect(result.candidates).toHaveLength(1);
    expect(result.coverageGaps).toHaveLength(3);
  });
  it("groups the same development and distinguishes repeated coverage from a meaningful follow-up", () => {
    const first = mapWebResponse(webResponse(), [], now).findings[0];
    const previous = [{ ...first, id: "74bc6471-3771-4ddd-912f-2b97e386fc1d" }];
    expect(
      mapWebResponse(webResponse(), previous, now).findings[0].novelty,
    ).toBe("repeated");
    const follow = {
      ...researchFinding,
      whatChanged: "The same platform expanded that setting to all accounts.",
      novelty: "follow_up",
      sources: [
        {
          ...researchFinding.sources[0],
          url: "https://example.com/expanded",
          announcedOn: "2026-10-08",
        },
      ],
    };
    expect(
      mapWebResponse(webResponse([follow], follow.sources), previous, now)
        .findings[0].novelty,
    ).toBe("follow_up");
    const grouped = mapWebResponse(
      webResponse(
        [researchFinding, follow],
        [...researchFinding.sources, ...follow.sources],
      ),
      [],
      now,
    );
    expect(grouped.findings).toHaveLength(1);
    expect(grouped.findings[0].sources).toHaveLength(2);
    expect(grouped.findings[0].whatChanged).toContain(follow.whatChanged);
  });
  it("deduplicates an RSS article also found by web search while retaining its citation and collection time", () => {
    const source = researchFinding.sources[0];
    const feed = {
      id: "85284621-181c-41ac-bf9b-a489feef4c63",
      url: `${source.url}?utm_source=rss#article`,
      title: source.title,
      text: researchFinding.whatChanged,
      contentHash: "feed-url-hash",
      fetchedAt: "2026-10-07T08:00:00Z",
      kind: "rss" as const,
      feedUrl: "https://example.com/feed.xml",
      feedPublishedAt: "2026-10-06T00:00:00Z",
    };
    const rssFinding = {
      ...researchFinding,
      sources: [{ ...source, url: feed.url }],
    };
    const result = mapWebResponse(
      webResponse([rssFinding, researchFinding]),
      [],
      now,
      [feed],
    );
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].sources).toHaveLength(1);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      url: source.url,
      fetchedAt: feed.fetchedAt,
    });
  });
  it("groups different RSS/web reports of one event, labels a later report as repeated, and retains a distinct development", () => {
    const coverage = {
      ...researchFinding.sources[0],
      url: "https://publisher.example/measurement-coverage",
      sourceKind: "secondary" as const,
    };
    const feed = {
      id: "85284621-181c-41ac-bf9b-a489feef4c63",
      url: coverage.url,
      title: coverage.title,
      text: researchFinding.whatChanged,
      contentHash: "coverage-hash",
      fetchedAt: "2026-10-07T08:00:00Z",
      kind: "rss" as const,
      feedUrl: "https://publisher.example/feed.xml",
      feedPublishedAt: null,
    };
    const report = {
      ...researchFinding,
      category: "trend_analysis",
      sources: [coverage],
    };
    const grouped = mapWebResponse(
      webResponse([report, researchFinding]),
      [],
      now,
      [feed],
    );
    expect(grouped.findings).toHaveLength(1);
    expect(grouped.findings[0].sources).toHaveLength(2);
    const previous = [
      { ...grouped.findings[0], id: "74bc6471-3771-4ddd-912f-2b97e386fc1d" },
    ];
    const other = {
      ...researchFinding,
      developmentKey: "different-account-security-release",
      whatChanged:
        "The platform introduced a separate account security control.",
    };
    const later = mapWebResponse(
      webResponse([researchFinding, other]),
      previous,
      now,
    );
    expect(later.findings).toHaveLength(2);
    expect(later.findings[0]).toMatchObject({
      novelty: "repeated",
      previousFindingId: previous[0].id,
    });
    expect(later.findings[1]).toMatchObject({
      novelty: "new",
      previousFindingId: null,
    });
  });
  it("keeps a real update at the same article URL but rejects a follow-up supported only by another tracking link", () => {
    const first = mapWebResponse(webResponse(), [], now).findings[0];
    const previous = [{ ...first, id: "74bc6471-3771-4ddd-912f-2b97e386fc1d" }];
    const follow = {
      ...researchFinding,
      whatChanged: "The platform expanded the setting to every account.",
      novelty: "follow_up",
      sources: [
        {
          ...researchFinding.sources[0],
          announcedOn: "2026-10-08",
          dateEvidence:
            "Updated October 8: the setting is available to every account.",
        },
      ],
    };
    expect(
      mapWebResponse(webResponse([follow]), previous, now).findings[0],
    ).toMatchObject({
      novelty: "follow_up",
      previousFindingId: previous[0].id,
    });
    const trackingOnly = {
      ...follow,
      sources: [
        {
          ...researchFinding.sources[0],
          url: `${researchFinding.sources[0].url}?utm_source=other#updated`,
        },
      ],
    };
    expect(
      mapWebResponse(webResponse([trackingOnly]), previous, now).findings[0],
    ).toMatchObject({
      novelty: "repeated",
      previousFindingId: previous[0].id,
    });
  });
  it("keeps distinct non-English developments separate instead of collapsing their keys", () => {
    const measurement = {
      ...researchFinding,
      developmentKey: "تحديث القياس",
      whatChanged: "تم تحديث خيارات القياس لجميع الحسابات.",
    };
    const security = {
      ...researchFinding,
      developmentKey: "تحديث الأمان",
      whatChanged: "تم طرح خيارات أمان جديدة لجميع الحسابات.",
    };
    const result = mapWebResponse(
      webResponse([measurement, security]),
      [],
      now,
    );
    expect(result.findings).toHaveLength(2);
    expect(
      new Set(result.findings.map((finding) => finding.fingerprint)).size,
    ).toBe(2);
  });
  it("recognizes changed non-English facts as a follow-up to their own development", () => {
    const measurement = {
      ...researchFinding,
      developmentKey: "تحديث القياس",
      whatChanged: "تم تحديث خيارات القياس لبعض الحسابات فقط.",
    };
    const first = mapWebResponse(webResponse([measurement]), [], now)
      .findings[0];
    const previous = [{ ...first, id: "74bc6471-3771-4ddd-912f-2b97e386fc1d" }];
    const expanded = {
      ...measurement,
      whatChanged: "تم توسيع خيارات القياس لتشمل جميع الحسابات.",
      novelty: "follow_up",
      sources: [
        {
          ...measurement.sources[0],
          announcedOn: "2026-10-08",
          dateEvidence: "Updated October 8: available to every account.",
        },
      ],
    };
    expect(
      mapWebResponse(webResponse([expanded]), previous, now).findings[0],
    ).toMatchObject({
      novelty: "follow_up",
      previousFindingId: previous[0].id,
    });
  });
  it("reports no evidence honestly, retains candidates after invalid synthesis, and identifies partial tool failure/budget stops", () => {
    expect(mapWebResponse(webResponse([], []), [], now).outcome).toBe("empty");
    const invalid = webResponse();
    invalid.output[1].content![0].text = "invalid";
    expect(mapWebResponse(invalid, [], now)).toMatchObject({
      outcome: "partial",
      errorCode: "INVALID_RESPONSE",
    });
    const failed = webResponse();
    failed.output[0].status = "failed";
    expect(mapWebResponse(failed, [], now).outcome).toBe("partial");
    const budget = webResponse();
    budget.output.push(...Array.from({ length: 5 }, () => budget.output[0]));
    expect(mapWebResponse(budget, [], now).coverageGaps.join(" ")).toContain(
      "budget",
    );
    expect(
      mapWebResponse({ status: "completed", output: [] }, [], now).outcome,
    ).toBe("failed");
  });
  it("keeps missing configuration distinct and makes no provider call", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_RESEARCH_MODEL", "");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const result = await researchWeb({
      clientId: "account",
      userId: "actor",
      settings: {
        revision: 1,
        prompt: INITIAL_RESEARCH_PROMPT,
        lookbackDays: 7,
        useProfileContext: false,
      },
      profile: null,
      previous: [],
    });
    expect(result.outcome).toBe("not_configured");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends OpenRouter a bounded server search and maps its sources without double-counting usage", async () => {
    vi.stubEnv("LLM_WEB_RESEARCH_PROVIDER", "OpenRouter");
    vi.stubEnv("LLM_WEB_RESEARCH_MODEL", "anthropic/claude-haiku-5.5");
    vi.stubEnv("OPENROUTER_API_KEY", "router-test-key");
    vi.stubEnv("OPENAI_API_KEY", "unused-openai-key");
    const raw = webResponse();
    raw.output[0].type = "openrouter:web_search";
    const response = {
      ...raw,
      usage: {
        ...raw.usage,
        server_tool_use_details: { web_search_requests: 1 },
      },
    };
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(response)));
    vi.stubGlobal("fetch", fetcher);
    const result = await researchWeb({
      clientId: "account",
      userId: "actor",
      settings: {
        revision: 1,
        prompt: "Research astronomy releases",
        lookbackDays: 7,
        useProfileContext: false,
      },
      profile: { private: "excluded-profile" },
      previous: [],
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe(
      "https://openrouter.ai/api/v1/responses",
    );
    const request = fetcher.mock.calls[0][1];
    expect(request.headers.Authorization).toBe("Bearer router-test-key");
    const body = JSON.parse(request.body);
    expect(body).toMatchObject({
      model: "anthropic/claude-haiku-5.5",
      store: false,
      truncation: "disabled",
      max_tool_calls: RESEARCH_BUDGET.maxToolCalls,
      max_output_tokens: RESEARCH_BUDGET.maxOutputTokens,
      tool_choice: "auto",
      provider: { require_parameters: true },
      tools: [
        {
          type: "openrouter:web_search",
          parameters: {
            engine: "exa",
            max_uses: RESEARCH_BUDGET.maxToolCalls,
            max_results: 5,
            max_total_results: 30,
            max_characters: 4000,
          },
        },
      ],
      text: { format: { type: "json_schema", strict: true } },
    });
    expect(JSON.parse(body.input).savedPrompt).toBe(
      "Research astronomy releases",
    );
    expect(body.input).not.toContain("excluded-profile");
    expect(result).toMatchObject({ outcome: "success", toolCalls: 1 });
    expect(result.candidates).toHaveLength(1);
    expect(writeLlmLog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        provider: "openrouter",
        model: "anthropic/claude-haiku-5.5",
        tokenInputCount: 100,
      }),
    );
  });
  it("accepts Router citation metadata with reported searches, but never a generated URL alone", () => {
    const raw = webResponse();
    const message = raw.output[1];
    const citation = {
      type: "url_citation",
      url: researchFinding.sources[0].url,
      title: "Release",
    };
    const response = {
      status: "completed",
      output: [
        {
          ...message,
          content: [{ ...message.content![0], annotations: [citation] }],
        },
      ],
      usage: { server_tool_use: { web_search_requests: 2 } },
    };
    expect(mapWebResponse(response, [], now)).toMatchObject({
      outcome: "success",
      toolCalls: 2,
    });
    expect(
      mapWebResponse(
        { ...response, output: [message], usage: undefined },
        [],
        now,
      ),
    ).toMatchObject({
      outcome: "failed",
      errorCode: "NO_SEARCH_EVIDENCE",
      findings: [],
    });
    expect(
      mapWebResponse({ ...response, usage: undefined }, [], now).outcome,
    ).toBe("partial");
    expect(
      mapWebResponse(
        { ...response, usage: { server_tool_use: { web_search_requests: 6 } } },
        [],
        now,
      ).outcome,
    ).toBe("partial");
  });
  it("retains Router candidates after failed search/synthesis and incomplete generation", () => {
    const raw = webResponse();
    raw.output[0].type = "openrouter:web_search";
    raw.output[0].status = "failed";
    expect(mapWebResponse(raw, [], now)).toMatchObject({
      outcome: "partial",
      toolCalls: 1,
    });
    raw.output[1].content![0].text = "invalid JSON";
    expect(mapWebResponse(raw, [], now)).toMatchObject({
      outcome: "partial",
      errorCode: "INVALID_RESPONSE",
    });
    expect(mapWebResponse(raw, [], now).candidates).toHaveLength(1);
    const incomplete = webResponse();
    incomplete.output[0].type = "openrouter:web_search";
    incomplete.status = "incomplete";
    expect(mapWebResponse(incomplete, [], now).outcome).toBe("partial");
  });
  it("does not call a legacy provider when Router is selected without its key", async () => {
    vi.stubEnv("LLM_WEB_RESEARCH_PROVIDER", "openrouter");
    vi.stubEnv("LLM_WEB_RESEARCH_MODEL", "anthropic/claude-haiku-5.5");
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "unused-openai-key");
    vi.stubEnv("OPENAI_RESEARCH_MODEL", "legacy-model");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    expect(
      await researchWeb({
        clientId: "account",
        userId: "actor",
        settings: {
          revision: 1,
          prompt: INITIAL_RESEARCH_PROMPT,
          lookbackDays: 7,
          useProfileContext: false,
        },
        profile: null,
        previous: [],
      }),
    ).toMatchObject({ outcome: "not_configured", errorCode: "NOT_CONFIGURED" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends the exact saved unrelated prompt, excludes profile when off, and bounds the paid call", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_RESEARCH_MODEL", "configured-model");
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(webResponse())));
    vi.stubGlobal("fetch", fetcher);
    const prompt =
      "Research consequential changes in astronomical instrumentation.";
    const result = await researchWeb({
      clientId: "account",
      userId: "actor",
      settings: {
        revision: 2,
        prompt,
        lookbackDays: 3,
        useProfileContext: false,
      },
      profile: { privateFact: "must-not-appear" },
      previous: [],
    });
    const body = JSON.parse(fetcher.mock.calls[0][1].body);
    const input = JSON.parse(body.input);
    expect(input.savedPrompt).toBe(prompt);
    expect(input.optionalProfileContext).toBeNull();
    expect(body.input).not.toContain("must-not-appear");
    expect(body).toMatchObject({
      store: false,
      max_tool_calls: RESEARCH_BUDGET.maxToolCalls,
      max_output_tokens: RESEARCH_BUDGET.maxOutputTokens,
      tool_choice: "required",
    });
    expect(body.include).toContain("web_search_call.action.sources");
    expect(result.outcome).toBe("success");
  });
  it("handles provider rate limits and timeouts without exposing provider bodies or prompts", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_RESEARCH_MODEL", "configured-model");
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response("sensitive provider details", { status: 429 }),
      );
    vi.stubGlobal("fetch", fetcher);
    const input = {
      clientId: "account",
      userId: "actor",
      settings: {
        revision: 1,
        prompt: INITIAL_RESEARCH_PROMPT,
        lookbackDays: 7,
        useProfileContext: false,
      },
      profile: null,
      previous: [],
    };
    expect(await researchWeb(input)).toMatchObject({
      outcome: "failed",
      errorCode: "PROVIDER_RATE_LIMITED",
    });
    fetcher.mockRejectedValue(
      new DOMException("private details", "TimeoutError"),
    );
    const timeout = await researchWeb(input);
    expect(timeout.errorCode).toBe("TIMEOUT");
    expect(JSON.stringify(timeout)).not.toContain("private details");
  });
  it("tells apart a missing model, no credit and a refused request, and keeps the provider message out of the saved result", async () => {
    vi.stubEnv("LLM_WEB_RESEARCH_PROVIDER", "openrouter");
    vi.stubEnv("LLM_WEB_RESEARCH_MODEL", "anthropic/claude-haiku-5.5");
    vi.stubEnv("OPENROUTER_API_KEY", "router-test-key");
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const input = {
      clientId: "account",
      userId: "actor",
      settings: { revision: 1, prompt: INITIAL_RESEARCH_PROMPT, lookbackDays: 7, useProfileContext: false },
      profile: null,
      previous: [],
    };
    for (const [status, code] of [
      [404, "PROVIDER_MODEL_NOT_FOUND"],
      [402, "PROVIDER_CREDITS"],
      [400, "PROVIDER_BAD_REQUEST"],
      [500, "PROVIDER_ERROR"],
    ] as const) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ error: { message: "secret prompt echo" } }), { status }),
        ),
      );
      const result = await researchWeb(input);
      expect(result.errorCode).toBe(code);
      expect(result.coverageGaps).toEqual([`The provider replied with status ${status}.`]);
      expect(JSON.stringify(result)).not.toContain("secret prompt echo");
    }
    // The administrator can still read the provider's own words in the server log.
    expect(logged.mock.calls.map((call) => String(call[0])).join(" ")).toContain("secret prompt echo");
  });
  it("refuses oversized context before a paid call instead of silently truncating profile fields", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_RESEARCH_MODEL", "configured-model");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const result = await researchWeb({
      clientId: "account",
      userId: "actor",
      settings: {
        revision: 1,
        prompt: INITIAL_RESEARCH_PROMPT,
        lookbackDays: 7,
        useProfileContext: true,
      },
      profile: { essential: "x".repeat(RESEARCH_BUDGET.maxInputBytes) },
      previous: [],
    });
    expect(result.errorCode).toBe("INPUT_TOO_LARGE");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
