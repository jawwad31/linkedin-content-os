import "server-only";

import { apiFailure } from "@/lib/errors/api-response";
import { getServerUser } from "@/lib/supabase/session";

export const RATE_LIMITED_MESSAGE =
  "Too many requests. Please wait and try again.";

export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

type RateLimitOptions = {
  action: string;
  clientId?: string;
  limit: number;
  windowMs?: number;
};

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
let lastCleanupAt = 0;

function getFallbackIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const firstForwardedIp = forwardedFor?.split(",")[0]?.trim();

  return (
    firstForwardedIp || request.headers.get("x-real-ip")?.trim() || "unknown"
  );
}

function cleanupExpiredBuckets(now: number) {
  if (now - lastCleanupAt < RATE_LIMIT_WINDOW_MS) return;

  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }

  lastCleanupAt = now;
}

/**
 * Lightweight private-MVP limiter.
 *
 * This is intentionally in-memory: it is per-process, not distributed across
 * replicas, and resets on deploy/restart. That is acceptable for the current
 * single Railway web instance, but it should be replaced with a shared store
 * before public/self-serve traffic or multiple web replicas.
 */
export async function enforceRateLimit(
  request: Request,
  options: RateLimitOptions,
): Promise<Response | null> {
  const now = Date.now();
  const windowMs = options.windowMs ?? RATE_LIMIT_WINDOW_MS;
  const { user } = await getServerUser();
  const subject = user?.id ?? `ip:${getFallbackIp(request)}`;
  const scope = options.clientId ?? "global";
  const key = `${options.action}:${scope}:${subject}`;

  cleanupExpiredBuckets(now);

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }

  if (current.count >= options.limit) {
    return apiFailure("RATE_LIMITED", RATE_LIMITED_MESSAGE, 429);
  }

  current.count += 1;
  return null;
}
