import "server-only";

import { z } from "zod";
import type { ResearchBudget } from "../contracts";
import {
  providerErrorDetail,
  providerFailureCode,
  readBoundedResponse,
  readBriefingJson,
  type Envelope,
} from "../provider";
import { strictJsonSchema } from "./schemas";

export type ModelConfig = {
  provider: "openrouter" | "openai";
  apiKey: string;
  model: string;
};

/** Everything the model steps of one run share: who to call, what is left to spend. */
export type RunLimits = {
  config: ModelConfig;
  budget: ResearchBudget;
  /** Milliseconds left of the whole run, when it must stop starting new steps. */
  remainingMs: () => number;
  usage: { input: number; output: number; modelCalls: number; repairs: number };
};

export type StageName = "plan" | "search" | "extract" | "synthesize";
export type CallFailure = { ok: false; code: string };

const endpoint = (provider: ModelConfig["provider"]) =>
  provider === "openrouter"
    ? "https://openrouter.ai/api/v1/responses"
    : "https://api.openai.com/v1/responses";

function addUsage(limits: RunLimits, envelope: Envelope) {
  limits.usage.modelCalls++;
  limits.usage.input += envelope.usage?.input_tokens ?? 0;
  limits.usage.output += envelope.usage?.output_tokens ?? 0;
}

/** One request to the provider. Failures are logged with the provider's message, server side only. */
async function post(
  limits: RunLimits,
  stage: StageName,
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<{ ok: true; envelope: Envelope } | CallFailure> {
  const { config } = limits;
  const allowed = Math.min(timeoutMs, limits.remainingMs() - 1_000);
  if (allowed < 3_000) return { ok: false, code: "TIME_BUDGET" };
  try {
    const response = await fetch(endpoint(config.provider), {
      method: "POST",
      signal: AbortSignal.timeout(allowed),
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        store: false,
        ...(config.provider === "openrouter" ? { provider: { require_parameters: true } } : {}),
        ...body,
      }),
    });
    if (!response.ok) {
      const detail = await providerErrorDetail(response);
      console.error(
        `[web-research] ${stage} step: provider replied ${response.status} for model ${config.model}: ${detail || "(no message)"}`,
      );
      return { ok: false, code: providerFailureCode(response.status) };
    }
    const envelope = await readBoundedResponse(response);
    addUsage(limits, envelope);
    return { ok: true, envelope };
  } catch (error) {
    const timedOut = error instanceof Error && /Timeout|Abort/.test(error.name);
    // Only the kind of failure is logged: a parser message could quote the answer.
    console.error(
      `[web-research] ${stage} step: ${timedOut ? "timed out" : `answer unusable (${error instanceof Error ? error.name : "unknown"})`}`,
    );
    return { ok: false, code: timedOut ? "TIMEOUT" : "PROVIDER_ERROR" };
  }
}

const messageTexts = (envelope: Envelope): string[] =>
  (envelope.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .flatMap((part) => (part.type === "output_text" && part.text ? [part.text] : []));

/**
 * One search step: the provider's web search tool, bounded. The reply is returned as it came, so
 * the caller reads the pages it consulted from the tool output; the model's own notes are not
 * relied on for facts.
 */
export async function callSearch(
  limits: RunLimits,
  args: { instructions: string; input: unknown; searches: number; timeoutMs: number },
): Promise<{ ok: true; envelope: Envelope } | CallFailure> {
  const openRouter = limits.config.provider === "openrouter";
  return post(
    limits,
    "search",
    {
      max_output_tokens: 1_500,
      // "auto" on OpenRouter: forcing a search on every internal step can burn the allowance.
      tool_choice: openRouter ? "auto" : "required",
      tools: openRouter
        ? [
            {
              type: "openrouter:web_search",
              parameters: {
                engine: "exa",
                max_results: 5,
                max_total_results: args.searches * 5,
                max_uses: args.searches,
                max_characters: 4000,
              },
            },
          ]
        : [{ type: "web_search", search_context_size: "medium", external_web_access: true }],
      // OpenRouter rejects this value; it reports consulted pages as citations instead.
      max_tool_calls: args.searches,
      ...(openRouter ? {} : { include: ["web_search_call.action.sources"] }),
      instructions: args.instructions,
      input: JSON.stringify(args.input),
    },
    args.timeoutMs,
  );
}

const REPAIR_INSTRUCTIONS =
  "The text in the input was meant to be a single JSON object that follows the required schema, but it could not be read as one. Convert it. Use only what the text says: add no facts, links, dates, quotes or fields it does not contain. Where a required field has nothing in the text, use null, an empty string or an empty list. Reply with the JSON object only.";

export type StructuredResult<T> = { ok: true; data: T } | CallFailure;

/**
 * One tool-free step that must answer in a given structure. If the answer is prose or does not
 * fit, one conversion pass is allowed (a run-wide cap applies), and only the text just returned
 * is converted: the pages and the saved prompt are not shown again, so nothing can be invented.
 */
export async function callStructured<T>(
  limits: RunLimits,
  args: {
    stage: Exclude<StageName, "search">;
    name: string;
    schema: z.ZodType<T>;
    instructions: string;
    input: unknown;
    maxOutputTokens: number;
    timeoutMs: number;
  },
): Promise<StructuredResult<T>> {
  const format = {
    type: "json_schema",
    name: args.name,
    strict: true,
    schema: strictJsonSchema(args.schema),
  };
  const read = (texts: string[]): T | null => {
    const parsed = args.schema.safeParse(readBriefingJson(texts));
    if (parsed.success) return parsed.data;
    // Shape only: which fields failed, never their content.
    console.error(
      `[web-research] ${args.stage} step: answer did not fit (${
        readBriefingJson(texts) === undefined
          ? "no JSON object found"
          : parsed.error.issues
              .slice(0, 5)
              .map((issue) => `${issue.path.join(".") || "(root)"} ${issue.code}`)
              .join("; ")
      })`,
    );
    return null;
  };
  const first = await post(
    limits,
    args.stage,
    {
      max_output_tokens: args.maxOutputTokens,
      text: { format },
      instructions: args.instructions,
      input: JSON.stringify(args.input),
    },
    args.timeoutMs,
  );
  if (!first.ok) return first;
  const texts = messageTexts(first.envelope);
  const direct = read(texts);
  if (direct) return { ok: true, data: direct };
  if (limits.usage.repairs >= limits.budget.maxRepairs || !texts.join("").trim())
    return { ok: false, code: "INVALID_RESPONSE" };
  limits.usage.repairs++;
  const repaired = await post(
    limits,
    args.stage,
    {
      max_output_tokens: args.maxOutputTokens,
      text: { format },
      instructions: REPAIR_INSTRUCTIONS,
      input: JSON.stringify({ text: texts.join("\n").slice(0, 16_000) }),
    },
    args.timeoutMs,
  );
  if (!repaired.ok) return repaired;
  const converted = read(messageTexts(repaired.envelope));
  return converted ? { ok: true, data: converted } : { ok: false, code: "INVALID_RESPONSE" };
}
