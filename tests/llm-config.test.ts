import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLlmConfig, getLlmModel, LLM_ROLES } from "@/lib/llm/config";
import { getOpenRouterConfig } from "@/lib/openrouter/client";

vi.mock("@/lib/llm/log", () => ({ writeLlmLog: vi.fn() }));

beforeEach(() => {
  for (const settings of Object.values(LLM_ROLES)) {
    vi.stubEnv(`${settings.prefix}_PROVIDER`, undefined);
    vi.stubEnv(`${settings.prefix}_MODEL`, undefined);
  }
  for (const key of [
    "OPENROUTER_API_KEY",
    "OPENAI_API_KEY",
    // Older settings that no longer do anything.
    "OPENROUTER_MODEL",
    "OPENROUTER_RESEARCH_MODEL",
    "OPENROUTER_PLANNING_MODEL",
    "OPENROUTER_CONTENT_MODEL",
    "OPENROUTER_REVIEW_MODEL",
    "OPENAI_RESEARCH_MODEL",
  ])
    vi.stubEnv(key, undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe("server-only LLM role configuration", () => {
  it("routes every role independently and normalizes provider names and whitespace", () => {
    vi.stubEnv("OPENROUTER_API_KEY", " router-key ");
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

  it("has no web-research-style synthesis role any more, and no older model settings", () => {
    expect(Object.keys(LLM_ROLES)).not.toContain("rssSynthesis");
    expect(Object.keys(LLM_ROLES)).toEqual([
      "webResearch", "rssClassifier", "planning", "content", "review",
      "newsletterPlan", "newsletterWrite", "newsletterQa",
    ]);
  });

  it("ignores the older single-model settings: a role with no pair is simply not configured", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "router-key");
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    vi.stubEnv("OPENROUTER_MODEL", "old-default");
    vi.stubEnv("OPENROUTER_RESEARCH_MODEL", "old-research");
    vi.stubEnv("OPENROUTER_PLANNING_MODEL", "old-planning");
    vi.stubEnv("OPENROUTER_CONTENT_MODEL", "old-content");
    vi.stubEnv("OPENROUTER_REVIEW_MODEL", "old-review");
    vi.stubEnv("OPENAI_RESEARCH_MODEL", "old-web");
    for (const role of Object.keys(LLM_ROLES) as (keyof typeof LLM_ROLES)[]) {
      expect(getLlmConfig(role)).toBeNull();
      expect(getLlmModel(role)).toBe("unconfigured");
      expect(getOpenRouterConfig(`${LLM_ROLES[role].prefix}_MODEL`)).toBeNull();
    }
    expect(getOpenRouterConfig()).toBeNull();
    expect(getOpenRouterConfig("SOMETHING_ELSE")).toBeNull();
  });

  it("lets web research run on OpenAI directly, and no other role", () => {
    vi.stubEnv("OPENAI_API_KEY", "openai-key");
    vi.stubEnv("LLM_WEB_RESEARCH_PROVIDER", "openai");
    vi.stubEnv("LLM_WEB_RESEARCH_MODEL", "web-model");
    expect(getLlmConfig("webResearch")).toEqual({
      provider: "openai", apiKey: "openai-key", model: "web-model",
    });
    // OpenRouter-only callers never receive a direct-provider assignment.
    expect(getOpenRouterConfig("LLM_WEB_RESEARCH_MODEL")).toBeNull();
    vi.stubEnv("LLM_CONTENT_PROVIDER", "openai");
    vi.stubEnv("LLM_CONTENT_MODEL", "content-model");
    expect(getLlmConfig("content")).toBeNull();
  });

  it.each([
    ["openrouter", undefined],
    [undefined, "new-model"],
    ["openrouter", "  "],
    ["anthropic", "new-model"],
    ["openai", "new-model"],
  ])("refuses an incomplete or unsupported writing pair (%s, %s)", (provider, model) => {
    vi.stubEnv("OPENROUTER_API_KEY", "router-key");
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
    vi.stubEnv("LLM_WEB_RESEARCH_PROVIDER", "openrouter");
    vi.stubEnv("LLM_WEB_RESEARCH_MODEL", "new-web");
    expect(getLlmConfig("webResearch")).toBeNull();
    expect(getLlmModel("webResearch")).toBe("new-web");
    vi.stubEnv("OPENROUTER_API_KEY", "router-key");
    expect(getLlmConfig("webResearch")?.apiKey).toBe("router-key");
  });
});
