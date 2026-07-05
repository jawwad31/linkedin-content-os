import "server-only";

import { FEED_FETCH_TIMEOUT_MS, SAFE_FEED_ERROR } from "./constants";

export type FeedFetchResult =
  | { ok: true; body: string }
  | { ok: false; error: string };

/**
 * Fetches a feed URL server-side with a hard timeout via AbortController.
 * Never throws — every failure path (timeout, network error, non-2xx
 * status) resolves to the same safe error message.
 */
export async function fetchFeed(
  url: string,
  timeoutMs: number = FEED_FETCH_TIMEOUT_MS,
): Promise<FeedFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "AIXelerateContentOS-RSSCollector/1.0",
      },
    });

    if (!response.ok) {
      return { ok: false, error: SAFE_FEED_ERROR };
    }

    const body = await response.text();
    return { ok: true, body };
  } catch {
    return { ok: false, error: SAFE_FEED_ERROR };
  } finally {
    clearTimeout(timeout);
  }
}
