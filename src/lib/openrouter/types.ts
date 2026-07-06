export type OpenRouterConfig = {
  apiKey: string;
  model: string;
};

export type OpenRouterChatMessage = {
  role: "system" | "user";
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
