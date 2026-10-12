import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLlmConfig, getLlmModel, LLM_ROLES } from "@/lib/llm/config";
import { getOpenRouterConfig } from "@/lib/openrouter/client";

vi.mock("@/lib/llm/log", () => ({ writeLlmLog: vi.fn() }));

beforeEach(() => {
  for (const settings of Object.values(LLM_ROLES)) {
    vi.stubEnv(`${settings.prefix}_PROVIDER`, undefined);
    vi.stubEnv(`${settings.prefix}_MODEL`, undefined);
    vi.stubEnv(settings.legacyModel, undefined);
  }
  for (const key of ["OPENROUTER_API_KEY", "OPENROUTER_MODEL", "OPENAI_API_KEY"])
    vi.stubEnv(key, undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("server-only LLM role configuration", () => {
  it("routes all six roles independently and normalizes provider names/whitespace", () => {
    vi.stubEnv("OPENROUTER_API_KEY", " router-key ");
    vi.stubEnv("OPENROUTER_MODEL", "legacy-default");
    for (const [role, settings] of Object.entries(LLM_ROLES)) {
      vi.stubEnv(`${settings.prefix}_PROVIDER`, " OpenRouter ");
      vi.stubEnv(`${settings.prefix}_MODEL`, ` ${role}-model `);
    }
    for (const role of Object.keys(LLM_ROLES) as (keyof typeof LLM_ROLES)[]) {
      expect(getLlmConfig(role)).toEqual({
        provider: "openrouter", apiKey: "router-key", model: `${role}-model`,
      });
      expect(getOpenRouterConfig(`${LLM_ROLES[role].prefix}_MODEL`))
        .toEqual({ apiKey: "router-key", model: `${role}-model` });
    }
  });

  it("keeps legacy writing/RSS defaults and the direct OpenAI web adapter usable", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "router-key");
    vi.stubEnv("OPENROUTER_MODEL", "legacy-default");
    vi.stubEnv("OPENROUTER_RESEARCH_MODEL", "legacy-research");
    vi.stubEnv("OPENROUTER_CONTENT_MODEL", "legacy-content");
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    vi.stubEnv("OPENAI_RESEARCH_MODEL", "legacy-web");
    expect(getOpenRouterConfig("LLM_PLANNING_MODEL")?.model).toBe("legacy-default");
    expect(getOpenRouterConfig("LLM_CONTENT_MODEL")?.model).toBe("legacy-content");
    expect(getLlmConfig("rssClassifier")?.model).toBe("legacy-research");
    expect(getLlmConfig("rssSynthesis")?.model).toBe("legacy-research");
    expect(getLlmConfig("webResearch")).toEqual({
      provider: "openai", apiKey: "openai-key", model: "legacy-web",
    });
  });

  it("splits RSS classifier/synthesis settings without changing the other role", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "router-key");
    vi.stubEnv("OPENROUTER_RESEARCH_MODEL", "old-shared-model");
    vi.stubEnv("LLM_RSS_SYNTHESIS_PROVIDER", "openrouter");
    vi.stubEnv("LLM_RSS_SYNTHESIS_MODEL", "new-synthesis-model");
    expect(getLlmConfig("rssClassifier")?.model).toBe("old-shared-model");
    expect(getLlmConfig("rssSynthesis")?.model).toBe("new-synthesis-model");
  });

  it.each([
    ["openrouter", undefined],
    [undefined, "new-model"],
    ["openrouter", "  "],
    ["anthropic", "new-model"],
    ["openai", "new-model"],
  ])("refuses an incomplete/unsupported writing pair (%s, %s), without legacy fallback", (provider, model) => {
    vi.stubEnv("OPENROUTER_API_KEY", "router-key");
    vi.stubEnv("OPENROUTER_MODEL", "old-default");
    vi.stubEnv("LLM_CONTENT_PROVIDER", provider);
    vi.stubEnv("LLM_CONTENT_MODEL", model);
    expect(getOpenRouterConfig("LLM_CONTENT_MODEL")).toBeNull();
  });

  it("newsletter stages follow planning, content and review until they get their own pair", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "router-key");
    vi.stubEnv("LLM_PLANNING_PROVIDER", "openrouter");
    vi.stubEnv("LLM_PLANNING_MODEL", "plan-model");
    vi.stubEnv("LLM_CONTENT_PROVIDER", "openrouter");
    vi.stubEnv("LLM_CONTENT_MODEL", "content-model");
    vi.stubEnv("LLM_REVIEW_PROVIDER", "openrouter");
    vi.stubEnv("LLM_REVIEW_MODEL", "review-model");
    expect(getOpenRouterConfig("LLM_NEWSLETTER_PLAN_MODEL")?.model).toBe("plan-model");
    expect(getOpenRouterConfig("LLM_NEWSLETTER_WRITE_MODEL")?.model).toBe("content-model");
    expect(getOpenRouterConfig("LLM_NEWSLETTER_QA_MODEL")?.model).toBe("review-model");
    vi.stubEnv("LLM_NEWSLETTER_QA_PROVIDER", "openrouter");
    vi.stubEnv("LLM_NEWSLETTER_QA_MODEL", "stronger-qa-model");
    expect(getOpenRouterConfig("LLM_NEWSLETTER_QA_MODEL")?.model).toBe("stronger-qa-model");
    expect(getOpenRouterConfig("LLM_REVIEW_MODEL")?.model).toBe("review-model");
    // An incomplete pair of its own fails closed instead of silently using the shared model.
    vi.stubEnv("LLM_NEWSLETTER_QA_MODEL", undefined);
    expect(getOpenRouterConfig("LLM_NEWSLETTER_QA_MODEL")).toBeNull();
  });

  it("never substitutes the other provider's key when a selected key is missing", () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    vi.stubEnv("OPENAI_RESEARCH_MODEL", "legacy-web");
    vi.stubEnv("LLM_WEB_RESEARCH_PROVIDER", "openrouter");
    vi.stubEnv("LLM_WEB_RESEARCH_MODEL", "new-web");
    expect(getLlmConfig("webResearch")).toBeNull();
    expect(getLlmModel("webResearch")).toBe("new-web");
    vi.stubEnv("OPENROUTER_API_KEY", "router-key");
    expect(getLlmConfig("webResearch")?.apiKey).toBe("router-key");
  });
});
