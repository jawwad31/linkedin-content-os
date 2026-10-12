import "server-only";

/**
 * Every model role is set by an explicit pair of server settings, `<PREFIX>_PROVIDER` and
 * `<PREFIX>_MODEL`. A role with only one of the two, or an unsupported provider, is not configured:
 * it fails closed and never borrows another role's or an older setting.
 */
export const LLM_ROLES = {
  webResearch: { prefix: "LLM_WEB_RESEARCH" },
  rssClassifier: { prefix: "LLM_RSS_CLASSIFIER" },
  planning: { prefix: "LLM_PLANNING" },
  content: { prefix: "LLM_CONTENT" },
  review: { prefix: "LLM_REVIEW" },
  // Newsletter stages follow the planning, content and review roles unless their own pair is set.
  newsletterPlan: { prefix: "LLM_NEWSLETTER_PLAN", fallback: "planning" },
  newsletterWrite: { prefix: "LLM_NEWSLETTER_WRITE", fallback: "content" },
  newsletterQa: { prefix: "LLM_NEWSLETTER_QA", fallback: "review" },
} as const satisfies Record<string, { prefix: string; fallback?: string }>;

export type LlmRole = keyof typeof LLM_ROLES;
export type LlmConfig = {
  provider: "openrouter" | "openai";
  model: string;
  apiKey: string;
};

function resolveSettings(role: LlmRole): Omit<LlmConfig, "apiKey"> | null {
  const settings: { prefix: string; fallback?: LlmRole } = LLM_ROLES[role];
  const providerValue = process.env[`${settings.prefix}_PROVIDER`];
  const modelValue = process.env[`${settings.prefix}_MODEL`];
  // A role with a fallback and no settings of its own simply follows the role it falls back to.
  if (providerValue === undefined && modelValue === undefined) {
    return settings.fallback ? resolveSettings(settings.fallback) : null;
  }
  const provider = providerValue?.trim().toLowerCase();
  const model = modelValue?.trim();
  if (!model || (provider !== "openrouter" && !(role === "webResearch" && provider === "openai")))
    return null;
  return { provider, model };
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
