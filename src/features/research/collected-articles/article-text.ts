import "server-only";

import {
  extractPage,
  fetchPublicText,
} from "@/features/research/automation/safe-fetch";

/** About 2,000 words: plenty for a post, and keeps the writer's input a sensible size. */
export const ARTICLE_TEXT_LIMIT = 12_000;
/** Below this the page is almost certainly a stub, a paywall notice or "enable JavaScript". */
export const ARTICLE_TEXT_MINIMUM = 400;
/** The page reader never keeps more than this; the extractor itself must not reject long pages. */
const EXTRACT_CEILING = 1_000_000;

export type ArticleTextResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false };

/** Cuts at a word boundary and says so, instead of ending mid-word. */
export function clipArticleText(text: string, limit = ARTICLE_TEXT_LIMIT) {
  if (text.length <= limit) return { text, truncated: false };
  const cut = text.slice(0, limit);
  const lastSpace = cut.lastIndexOf(" ");
  return {
    text: `${(lastSpace > limit * 0.8 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`,
    truncated: true,
  };
}

/**
 * Reads one article page for use as private writing context. Goes through the same
 * hardened public-page reader as imported research links (public addresses only, size
 * and time limits, bounded redirects). Any problem returns `{ ok: false }`: the caller
 * then falls back to the feed summary, so a blocked or paid site never breaks saving.
 */
export async function readArticleText(url: string): Promise<ArticleTextResult> {
  try {
    const page = await fetchPublicText(url);
    const extracted = extractPage(page.original, new URL(page.url), EXTRACT_CEILING);
    if (extracted.text.length < ARTICLE_TEXT_MINIMUM) return { ok: false };
    const { text, truncated } = clipArticleText(extracted.text);
    return { ok: true, text, truncated };
  } catch {
    return { ok: false };
  }
}
