/** Plain reasons for a failed web research run, keyed by the code saved with the briefing. */
const REASONS: Record<string, string> = {
  PROVIDER_AUTH_FAILED:
    "The research provider rejected the saved API key. An administrator should check the key for web research.",
  PROVIDER_RATE_LIMITED:
    "The research provider is limiting requests or the account is out of credit. Wait a little and retry, or check the provider account.",
  PROVIDER_ERROR:
    "The research provider returned an error. This is most often a wrong model name, or a model that cannot search the web. An administrator should check the web research model.",
  PROVIDER_CREDITS:
    "The provider account has no credit left for this request. Add credit to the provider account, then retry.",
  PROVIDER_MODEL_NOT_FOUND:
    "The provider does not know the web research model name. An administrator should check the model name against the provider's model list.",
  PROVIDER_BAD_REQUEST:
    "The provider refused the request, most often because the chosen model cannot search the web or return a structured answer. An administrator should choose another model for web research. The provider's exact message is in the server log.",
  TIMEOUT:
    "The search took too long and was stopped. Retry; if it keeps happening, narrow the research prompt.",
  INVALID_RESPONSE:
    "A step's answer could not be read in the required form, even after one conversion attempt. The sources collected are kept. Retry; if it repeats, the model may not support structured answers.",
  NO_SEARCH_EVIDENCE:
    "The model answered without actually searching the web, so nothing was saved. Retry, or use a model that supports web search.",
  INPUT_TOO_LARGE:
    "The research input was too large. Shorten the prompt or turn off optional profile context, then retry.",
};

export function failureReason(code: string | null): string {
  return (
    (code && REASONS[code]) ||
    "The run did not complete and the provider gave no clear reason. Retry; if it repeats, ask an administrator to check the research provider setup."
  );
}
