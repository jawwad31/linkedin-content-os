export const FEED_FETCH_TIMEOUT_MS = 20_000;
export const MAX_ENTRIES_PER_FEED = 50;
export const MAX_SUMMARY_LENGTH = 1200;

/**
 * Single safe, user-facing message for any feed failure (timeout, non-2xx,
 * unreachable host, malformed XML). Matches the RSS failure copy in
 * security-access.md — never expose the specific underlying cause.
 */
export const SAFE_FEED_ERROR =
  "We could not read this feed. Check the URL or try again later.";
