import "server-only";

import type {
  OpenRouterChatMessage,
  OpenRouterCompletionResult,
  OpenRouterConfig,
} from "./types";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_TIMEOUT_MS = 30_000;

/**
 * Reads OPENROUTER_API_KEY / OPENROUTER_MODEL from the environment. Returns
 * null if either is missing — callers must fail safely in that case, never
 * fall back to a hardcoded model/key.
 */
export function getOpenRouterConfig(): OpenRouterConfig | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;

  if (!apiKey || !model) return null;

  return { apiKey, model };
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
): Promise<OpenRouterCompletionResult> {
  const firstAttempt = await requestOpenRouterCompletionOnce(config, messages);
  if (firstAttempt.ok || !isRetryableOpenRouterFailure(firstAttempt.errorType)) {
    return firstAttempt;
  }

  return requestOpenRouterCompletionOnce(config, messages);
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
): Promise<OpenRouterCompletionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
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
