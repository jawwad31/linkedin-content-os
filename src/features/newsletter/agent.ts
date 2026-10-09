import "server-only";
import { z } from "zod";
import { loadStagePlaybook } from "@/lib/ai/playbooks/loader";
import {
  getOpenRouterConfig,
  requestStructuredCompletion,
} from "@/lib/openrouter/client";
import type { ContentAgentBusinessContext } from "@/features/posts/agents/content-agent";
import type { RetrievedExcerpt } from "@/features/documents/schemas";
import {
  newsletterChecks,
  qaSchema,
  type EditionInput,
  type NewsletterSource,
  type NewsletterQa,
} from "./contracts";

const bodiesSchema = z
  .object({
    bodies: z.array(z.string().trim().min(1).max(14000)).min(1).max(8),
  })
  .strict();
const bodiesJson = {
  type: "object",
  properties: { bodies: { type: "array", items: { type: "string" } } },
  required: ["bodies"],
  additionalProperties: false,
} as const;
const qaJson = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["pass", "needs_edit"] },
    issues: { type: "array", items: { type: "string" } },
    proofNotes: { type: "string" },
  },
  required: ["verdict", "issues", "proofNotes"],
  additionalProperties: false,
} as const;
export type NewsletterAgentInput = {
  clientId: string;
  userId: string;
  payload: EditionInput;
  sources: NewsletterSource[];
  profile: ContentAgentBusinessContext;
  excerpts: RetrievedExcerpt[];
};

export async function newsletterPrompt(
  input: NewsletterAgentInput,
  mode: "draft" | "qa",
) {
  const playbook = await loadStagePlaybook("newsletter");
  return {
    system: `${playbook}\n\nTask: ${mode === "draft" ? "Draft bodies for the confirmed sections, exactly in order. Return JSON bodies only." : "Independently review the edition. Return verdict, issues and proofNotes as JSON."}`,
    user: JSON.stringify({
      edition: input.payload,
      selectedSources: input.sources.map((s) => ({
        id: s.source_id,
        type: s.source_type,
        contentHash: s.content_hash,
        facts: s.snapshot,
      })),
      profile: input.profile,
      supportingExcerpts: input.excerpts,
    }),
  };
}
export async function draftNewsletter(
  input: NewsletterAgentInput,
): Promise<EditionInput | null> {
  const config = getOpenRouterConfig("LLM_CONTENT_MODEL");
  if (!config) return null;
  const prompt = await newsletterPrompt(input, "draft");
  if (Buffer.byteLength(prompt.user) > 180000) return null; // Fail explicitly; never truncate selected facts.
  const result = await requestStructuredCompletion(
    config,
    [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    bodiesSchema,
    bodiesJson,
    "newsletter-draft",
    { timeoutMs: 90000, maxTokens: 10000, temperature: 0.35 },
    input.clientId,
    input.userId,
    "newsletter_draft",
  );
  if (!result.ok || result.data.bodies.length !== input.payload.sections.length)
    return null;
  return {
    ...input.payload,
    sections: input.payload.sections.map((s, i) => ({
      ...s,
      body: result.data.bodies[i],
    })),
  };
}
export async function reviewNewsletter(
  input: NewsletterAgentInput,
): Promise<NewsletterQa> {
  const deterministic = newsletterChecks(input.payload, input.sources);
  const config = getOpenRouterConfig("LLM_REVIEW_MODEL");
  let qa: NewsletterQa = {
    verdict: "needs_edit",
    issues: [
      "AI review is unavailable. Inspect all facts, links and private evidence before approval.",
    ],
    proofNotes: "Independent AI review did not complete.",
  };
  if (config) {
    const prompt = await newsletterPrompt(input, "qa");
    if (Buffer.byteLength(prompt.user) <= 180000) {
      const result = await requestStructuredCompletion(
        config,
        [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        qaSchema,
        qaJson,
        "newsletter-qa",
        { timeoutMs: 90000, maxTokens: 4000, temperature: 0.1 },
        input.clientId,
        input.userId,
        "newsletter_qa",
      );
      if (result.ok) qa = result.data;
    } else
      qa.issues.push(
        "The context exceeds the model budget; no selected facts were truncated.",
      );
  }
  const issues = [...new Set([...deterministic, ...qa.issues])];
  return { ...qa, verdict: issues.length ? "needs_edit" : qa.verdict, issues };
}
