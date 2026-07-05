const TRACKING_PARAM_NAMES = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
  "ref",
  "igshid",
]);

/**
 * Normalizes a URL for stable content-hash dedupe. `new URL()` already
 * lowercases the scheme and hostname per the WHATWG URL spec, so this only
 * needs to additionally drop the fragment and strip known tracking params
 * while preserving every other query param. Returns null for anything that
 * isn't a parseable http/https URL.
 */
export function normalizeUrl(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;

  url.hash = "";

  const paramsToDelete: string[] = [];
  url.searchParams.forEach((_, key) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey.startsWith("utm_") || TRACKING_PARAM_NAMES.has(lowerKey)) {
      paramsToDelete.push(key);
    }
  });
  paramsToDelete.forEach((key) => url.searchParams.delete(key));

  return url.toString();
}
