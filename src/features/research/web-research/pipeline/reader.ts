import "server-only";

import {
  extractPage,
  fetchPublicText,
  type FetchDependencies,
} from "../../automation/safe-fetch";
import { clipArticleText } from "../../collected-articles/article-text";

/** Below this the page is almost certainly a stub, a paywall notice or "enable JavaScript". */
export const MINIMUM_PAGE_CHARACTERS = 250;
/** The extractor itself must not reject long pages; the clip below decides how much is kept. */
const EXTRACT_CEILING = 1_000_000;
const PER_PAGE_TIMEOUT_MS = 15_000;

export type PageRead =
  | {
      ok: true;
      requestedUrl: string;
      /** The address the content really came from, after any redirects. */
      url: string;
      title: string;
      text: string;
      truncated: boolean;
      contentHash: string;
      /** When we read it. This is not when the page was published. */
      fetchedAt: string;
    }
  | { ok: false; requestedUrl: string; reason: "blocked" | "unavailable" | "empty" };

/**
 * Reads one public page through the project's hardened reader (public addresses only, DNS and
 * every redirect rechecked, size, time and content-type limits). This adds no network code of
 * its own: a page that cannot be read safely, is paid, needs a script to show its text, or is
 * not plain HTML comes back as not read, and is never treated as evidence.
 */
export async function readSourcePage(
  requestedUrl: string,
  options: { charLimit: number; deps?: FetchDependencies; now?: Date },
): Promise<PageRead> {
  try {
    const page = await fetchPublicText(requestedUrl, options.deps, PER_PAGE_TIMEOUT_MS);
    const extracted = extractPage(page.original, new URL(page.url), EXTRACT_CEILING);
    if (extracted.text.length < MINIMUM_PAGE_CHARACTERS)
      return { ok: false, requestedUrl, reason: "empty" };
    const { text, truncated } = clipArticleText(extracted.text, options.charLimit);
    return {
      ok: true,
      requestedUrl,
      url: extracted.url,
      title: extracted.title,
      text,
      truncated,
      contentHash: extracted.contentHash,
      fetchedAt: (options.now ?? new Date()).toISOString(),
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    return {
      ok: false,
      requestedUrl,
      reason: code === "SOURCE_BLOCKED" ? "blocked" : code === "SOURCE_UNAVAILABLE" ? "unavailable" : "empty",
    };
  }
}

/** Runs the work over the items, a few at a time, and stops starting new ones when asked to. */
export async function mapLimited<T, R>(
  items: T[],
  limit: number,
  shouldStop: () => boolean,
  work: (item: T, index: number) => Promise<R>,
): Promise<(R | undefined)[]> {
  const results: (R | undefined)[] = new Array(items.length).fill(undefined);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length || shouldStop()) return;
      results[index] = await work(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
