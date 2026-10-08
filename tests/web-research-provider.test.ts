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

vi.mock("@/lib/llm/log", () => ({ writeLlmLog: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
const now = new Date("2026-10-08T08:00:00Z");
describe("P07 bounded search and evidence mapping", () => {
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
