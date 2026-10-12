import "server-only";

/** Explicit role settings replace legacy settings as a pair; incomplete pairs fail closed. */
export const LLM_ROLES = {
  webResearch: { prefix: "LLM_WEB_RESEARCH", legacyModel: "OPENAI_RESEARCH_MODEL" },
  rssClassifier: { prefix: "LLM_RSS_CLASSIFIER", legacyModel: "OPENROUTER_RESEARCH_MODEL" },
  rssSynthesis: { prefix: "LLM_RSS_SYNTHESIS", legacyModel: "OPENROUTER_RESEARCH_MODEL" },
  planning: { prefix: "LLM_PLANNING", legacyModel: "OPENROUTER_PLANNING_MODEL" },
  content: { prefix: "LLM_CONTENT", legacyModel: "OPENROUTER_CONTENT_MODEL" },
  review: { prefix: "LLM_REVIEW", legacyModel: "OPENROUTER_REVIEW_MODEL" },
  // Newsletter stages follow the planning, content and review roles unless their own pair is set.
  newsletterPlan: { prefix: "LLM_NEWSLETTER_PLAN", legacyModel: "OPENROUTER_PLANNING_MODEL", fallback: "planning" },
  newsletterWrite: { prefix: "LLM_NEWSLETTER_WRITE", legacyModel: "OPENROUTER_CONTENT_MODEL", fallback: "content" },
  newsletterQa: { prefix: "LLM_NEWSLETTER_QA", legacyModel: "OPENROUTER_REVIEW_MODEL", fallback: "review" },
} as const satisfies Record<string, { prefix: string; legacyModel: string; fallback?: string }>;

export type LlmRole = keyof typeof LLM_ROLES;
export type LlmConfig = {
  provider: "openrouter" | "openai";
  model: string;
  apiKey: string;
};

function resolveSettings(role: LlmRole): Omit<LlmConfig, "apiKey"> | null {
  const settings: { prefix: string; legacyModel: string; fallback?: LlmRole } = LLM_ROLES[role];
  const providerValue = process.env[`${settings.prefix}_PROVIDER`];
  const modelValue = process.env[`${settings.prefix}_MODEL`];
  // A role with a fallback and no settings of its own simply follows the role it falls back to.
  if (providerValue === undefined && modelValue === undefined && settings.fallback)
    return resolveSettings(settings.fallback);
  if (providerValue !== undefined || modelValue !== undefined) {
    const provider = providerValue?.trim().toLowerCase();
    const model = modelValue?.trim();
    if (!model || (provider !== "openrouter" && !(role === "webResearch" && provider === "openai")))
      return null;
    return { provider, model };
  }

  // Keep older deployments usable while Railway switches to the six role pairs.
  const provider = role === "webResearch" ? "openai" : "openrouter";
  const model = process.env[settings.legacyModel]?.trim() ||
    (provider === "openrouter" ? process.env.OPENROUTER_MODEL?.trim() : undefined);
  return model ? { provider, model } : null;
}

export function getLlmModel(role: LlmRole): string {
  return resolveSettings(role)?.model ?? "unconfigured";
}

export function getLlmConfig(role: LlmRole): LlmConfig | null {
  const settings = resolveSettings(role);
  if (!settings) return null;
  const apiKey = process.env[settings.provider === "openrouter" ? "OPENROUTER_API_KEY" : "OPENAI_API_KEY"]?.trim();
  return apiKey ? { ...settings, apiKey } : null;
}
