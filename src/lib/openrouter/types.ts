export type OpenRouterConfig = {
  apiKey: string;
  model: string;
};

export type OpenRouterChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type OpenRouterCompletionResult =
  | {
      ok: true;
      content: string;
      inputTokens: number | null;
      outputTokens: number | null;
    }
  | { ok: false; errorType: string };

export type OpenRouterRequestOptions = {
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
  responseFormat?:
    | { type: "json_object" }
    | {
        type: "json_schema";
        json_schema: {
          name: string;
          strict: boolean;
          schema: Record<string, unknown>;
        };
      };
};
