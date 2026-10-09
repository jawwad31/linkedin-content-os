import "server-only";

import { FEED_FETCH_TIMEOUT_MS, SAFE_FEED_ERROR } from "./constants";
import {
  fetchPublicText,
  type FetchDependencies,
} from "../automation/safe-fetch";

export type FeedFetchResult =
  { ok: true; body: string } | { ok: false; error: string };

/**
 * Fetches a feed URL server-side with a hard timeout via AbortController.
 * Never throws — every failure path (timeout, network error, non-2xx
 * status) resolves to the same safe error message.
 */
export async function fetchFeed(
  url: string,
  timeoutMs: number = FEED_FETCH_TIMEOUT_MS,
  deps?: FetchDependencies,
): Promise<FeedFetchResult> {
  try {
    const response = await fetchPublicText(url, deps, timeoutMs);
    return { ok: true, body: response.original };
  } catch {
    return { ok: false, error: SAFE_FEED_ERROR };
  }
}
