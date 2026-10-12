import "server-only";

import { z } from "zod";
import { writeLlmLog } from "@/lib/llm/log";
import { getLlmConfig, LLM_ROLES, type LlmRole } from "@/lib/llm/config";

import type {
  OpenRouterChatMessage,
  OpenRouterCompletionResult,
  OpenRouterConfig,
  OpenRouterRequestOptions,
} from "./types";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_TIMEOUT_MS = 30_000;

/**
 * Resolves the OpenRouter key and model for one role, given the name of the role's model
 * setting (for example "LLM_CONTENT_MODEL"). A role not set to OpenRouter, or an unknown name,
 * is not configured.
 */
export function getOpenRouterConfig(modelEnvKey?: string): OpenRouterConfig | null {
  const role = (Object.keys(LLM_ROLES) as LlmRole[]).find(
    (role) => `${LLM_ROLES[role].prefix}_MODEL` === modelEnvKey,
  );
  if (!role) return null;
  const config = getLlmConfig(role);
  return config?.provider === "openrouter"
    ? { apiKey: config.apiKey, model: config.model }
    : null;
}

/**
 * Server-only OpenRouter chat completion call with a hard timeout. Never
 * throws — every failure path (timeout, network error, non-2xx, malformed
 * response) resolves to a short safe errorType tag, never the provider's
 * raw error text.
 */
export async function requestOpenRouterCompletion(
  config: OpenRouterConfig,
  messages: OpenRouterChatMessage[],
  options?: OpenRouterRequestOptions,
): Promise<OpenRouterCompletionResult> {
  const firstAttempt = await requestOpenRouterCompletionOnce(config, messages, options);
  if (firstAttempt.ok || !isRetryableOpenRouterFailure(firstAttempt.errorType)) {
    return firstAttempt;
  }

  return requestOpenRouterCompletionOnce(config, messages, options);
}

function isRetryableOpenRouterFailure(errorType: string): boolean {
  return (
    errorType === "timeout" ||
    errorType === "network_error" ||
    errorType === "http_429" ||
    /^http_5\d\d$/.test(errorType)
  );
}

async function requestOpenRouterCompletionOnce(
  config: OpenRouterConfig,
  messages: OpenRouterChatMessage[],
  options?: OpenRouterRequestOptions,
): Promise<OpenRouterCompletionResult> {
  const timeoutMs = options?.timeoutMs ?? OPENROUTER_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const bodyPayload: Record<string, unknown> = {
      model: config.model,
      messages,
      response_format: options?.responseFormat ?? { type: "json_object" },
      temperature: options?.temperature ?? 0.2,
    };

    if (options?.maxTokens !== undefined) {
      bodyPayload.max_tokens = options.maxTokens;
    }

    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyPayload),
    });

    if (!response.ok) {
      if (response.status === 400) {
        let errorMsg = "";
        try {
          const errBody = await response.json() as { error?: { message?: string } };
          errorMsg = errBody?.error?.message || "";
        } catch {}

        const isUnsupported =
          errorMsg.toLowerCase().includes("response_format") ||
          errorMsg.toLowerCase().includes("json_schema") ||
          errorMsg.toLowerCase().includes("structured");

        if (isUnsupported) {
          return { ok: false, errorType: "structured_output_unsupported" };
        }
      }

      return { ok: false, errorType: `http_${response.status}` };
    }

    const body: unknown = await response.json();
    const content = (
      body as { choices?: { message?: { content?: unknown } }[] }
    )?.choices?.[0]?.message?.content;

    if (typeof content !== "string") {
      return { ok: false, errorType: "invalid_response_shape" };
    }

    const usage = (body as { usage?: Record<string, unknown> })?.usage;

    return {
      ok: true,
      content,
      inputTokens:
        typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : null,
      outputTokens:
        typeof usage?.completion_tokens === "number"
          ? usage.completion_tokens
          : null,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, errorType: "timeout" };
    }
    return { ok: false, errorType: "network_error" };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Safely extracts JSON object content from markdown fenced blocks or prose.
 */
export function extractJson(content: string): string {
  const trimmed = content.trim();

  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {}

  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = trimmed.match(codeBlockRegex);
  if (match && match[1]) {
    const extracted = match[1].trim();
    try {
      JSON.parse(extracted);
      return extracted;
    } catch {}
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {}
  }

  return trimmed;
}

export type StructuredCompletionResult<T> =
  | { ok: true; data: T; inputTokens: number | null; outputTokens: number | null }
  | { ok: false; errorType: string };

/**
 * Executes a structured OpenRouter completion using json_schema with automatic
 * json_object fallback, safe extraction, Zod validation, and corrective retries.
 */
export async function requestStructuredCompletion<T>(
  config: OpenRouterConfig,
  messages: OpenRouterChatMessage[],
  zodSchema: z.Schema<T>,
  jsonSchema: Record<string, unknown>,
  jsonSchemaName: string,
  options: {
    timeoutMs: number;
    maxTokens?: number;
    temperature: number;
  },
  clientId: string,
  userId: string | null,
  feature: string,
): Promise<StructuredCompletionResult<T>> {
  let useJsonSchema = true;

  // Attempt 1: Strict JSON Schema format
  let completion = await requestOpenRouterCompletion(config, messages, {
    ...options,
    responseFormat: {
      type: "json_schema",
      json_schema: {
        name: jsonSchemaName,
        strict: true,
        schema: jsonSchema,
      },
    },
  });

  if (!completion.ok && completion.errorType === "structured_output_unsupported") {
    // Log initial failure as structured_output_unsupported and transition to fallback format
    await writeLlmLog({
      clientId,
      userId,
      provider: "openrouter",
      model: config.model,
      feature,
      status: "error",
      errorType: "structured_output_unsupported",
    });

    useJsonSchema = false;

    const fallbackMessages = [
      ...messages,
      {
        role: "system" as const,
        content: "IMPORTANT: You must return only the raw JSON object. Do not include any markdown styling, surrounding text, or explanation.",
      },
    ];

    completion = await requestOpenRouterCompletion(config, fallbackMessages, {
      ...options,
      responseFormat: { type: "json_object" },
    });
  }

  if (!completion.ok) {
    await writeLlmLog({
      clientId,
      userId,
      provider: "openrouter",
      model: config.model,
      feature,
      status: "error",
      errorType: completion.errorType,
    });
    return { ok: false, errorType: completion.errorType };
  }

  const processOutput = (
    rawContent: string,
  ): { ok: true; data: T } | { ok: false; errorType: "invalid_json" | "invalid_schema"; errorDetails?: string } => {
    const extracted = useJsonSchema ? rawContent.trim() : extractJson(rawContent);

    let parsed: unknown;
    try {
      parsed = JSON.parse(extracted);
    } catch {
      return { ok: false, errorType: "invalid_json" };
    }

    const validation = zodSchema.safeParse(parsed);
    if (!validation.success) {
      const details = validation.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.code}`)
        .join("\n");
      return { ok: false, errorType: "invalid_schema", errorDetails: details };
    }

    return { ok: true, data: validation.data };
  };

  const initialResult = processOutput(completion.content);
  if (initialResult.ok) {
    await writeLlmLog({
      clientId,
      userId,
      provider: "openrouter",
      model: config.model,
      feature,
      status: "success",
      tokenInputCount: completion.inputTokens,
      tokenOutputCount: completion.outputTokens,
    });
    return {
      ok: true,
      data: initialResult.data,
      inputTokens: completion.inputTokens,
      outputTokens: completion.outputTokens,
    };
  }

  // Succeeded at call level but failed validation (invalid_json or invalid_schema). Log the error.
  await writeLlmLog({
    clientId,
    userId,
    provider: "openrouter",
    model: config.model,
    feature,
    status: "error",
    errorType: initialResult.errorType,
    tokenInputCount: completion.inputTokens,
    tokenOutputCount: completion.outputTokens,
  });

  if (initialResult.errorType === "invalid_schema" && initialResult.errorDetails) {
    console.error(`[${feature}] [Model: ${config.model}] Invalid schema paths:\n${initialResult.errorDetails}`);
  }

  // Corrective Retry: exactly one corrective retry allowed
  const retryMessages = [
    ...messages,
    {
      role: "user" as const,
      content: "The previous response did not match the required schema. Please return only the corrected JSON object.",
    },
  ];

  let retryCompletion: OpenRouterCompletionResult;
  if (useJsonSchema) {
    retryCompletion = await requestOpenRouterCompletion(config, retryMessages, {
      ...options,
      responseFormat: {
        type: "json_schema",
        json_schema: {
          name: jsonSchemaName,
          strict: true,
          schema: jsonSchema,
        },
      },
    });
  } else {
    const fallbackRetryMessages = [
      ...retryMessages,
      {
        role: "system" as const,
        content: "IMPORTANT: You must return only the raw JSON object. Do not include any markdown styling, surrounding text, or explanation.",
      },
    ];
    retryCompletion = await requestOpenRouterCompletion(config, fallbackRetryMessages, {
      ...options,
      responseFormat: { type: "json_object" },
    });
  }

  if (!retryCompletion.ok) {
    await writeLlmLog({
      clientId,
      userId,
      provider: "openrouter",
      model: config.model,
      feature,
      status: "error",
      errorType: retryCompletion.errorType,
    });
    return { ok: false, errorType: retryCompletion.errorType };
  }

  const retryResult = processOutput(retryCompletion.content);
  if (retryResult.ok) {
    await writeLlmLog({
      clientId,
      userId,
      provider: "openrouter",
      model: config.model,
      feature,
      status: "success",
      tokenInputCount: retryCompletion.inputTokens,
      tokenOutputCount: retryCompletion.outputTokens,
    });
    return {
      ok: true,
      data: retryResult.data,
      inputTokens: retryCompletion.inputTokens,
      outputTokens: retryCompletion.outputTokens,
    };
  }

  // Failed corrective retry validation
  await writeLlmLog({
    clientId,
    userId,
    provider: "openrouter",
    model: config.model,
    feature,
    status: "error",
    errorType: retryResult.errorType,
    tokenInputCount: retryCompletion.inputTokens,
    tokenOutputCount: retryCompletion.outputTokens,
  });

  if (retryResult.errorType === "invalid_schema" && retryResult.errorDetails) {
    console.error(`[${feature}] [Model: ${config.model}] Invalid schema paths:\n${retryResult.errorDetails}`);
  }

  return { ok: false, errorType: retryResult.errorType };
}
