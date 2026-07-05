import { createHash } from "node:crypto";

/**
 * SHA-256 hash of an already-normalized URL. Used as content_hash for the
 * client_id + content_hash uniqueness constraint on market_signal_items.
 */
export function hashNormalizedUrl(normalizedUrl: string): string {
  return createHash("sha256").update(normalizedUrl).digest("hex");
}
