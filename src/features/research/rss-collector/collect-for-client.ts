import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { collectSource } from "./collect-source";

export type CollectForClientSummary = {
  sourcesProcessed: number;
  totalFetched: number;
  totalNew: number;
  skippedDuplicate: number;
  skippedInvalid: number;
  skippedStale: number;
  skippedError: number;
  skippedSources: number;
  loadError: boolean;
  errors: { sourceId: string; sourceName: string; message: string }[];
};

/**
 * Collects every active, non-archived RSS source for one client. Uses the
 * service-role client: this has no end-user session (it's called by a
 * worker or a trusted server route, not directly by browser code), so RLS's
 * authenticated write policies do not apply; this function is the trusted
 * caller, scoped to one client_id throughout.
 */
export async function collectForClient(
  clientId: string,
  options: { maxSources?: number; beforeSource?: () => Promise<void> } = {},
): Promise<CollectForClientSummary> {
  const admin = createAdminClient();

  const summary: CollectForClientSummary = {
    sourcesProcessed: 0,
    totalFetched: 0,
    totalNew: 0,
    skippedDuplicate: 0,
    skippedInvalid: 0,
    skippedStale: 0,
    skippedError: 0,
    skippedSources: 0,
    loadError: false,
    errors: [],
  };

  let query = admin
    .from("rss_sources")
    .select("id, client_id, source_name, feed_url, recency_days", {
      count: "exact",
    })
    .eq("client_id", clientId)
    .eq("active", true)
    .is("deleted_at", null);
  if (options.maxSources) query = query.order("id").limit(options.maxSources);
  const { data: sources, error, count } = await query;

  if (error || !sources) {
    summary.loadError = true;
    return summary;
  }
  summary.skippedSources = Math.max(
    0,
    (count ?? sources.length) - sources.length,
  );

  for (const source of sources) {
    await options.beforeSource?.();
    const result = await collectSource(admin, {
      id: source.id,
      clientId: source.client_id,
      sourceName: source.source_name,
      feedUrl: source.feed_url,
      recencyDays: source.recency_days,
    });

    summary.sourcesProcessed += 1;
    summary.totalFetched += result.fetched;
    summary.totalNew += result.inserted;
    summary.skippedDuplicate += result.skippedDuplicate;
    summary.skippedInvalid += result.skippedInvalid;
    summary.skippedStale += result.skippedStale;

    if (result.error) {
      summary.skippedError += 1;
      summary.errors.push({
        sourceId: source.id,
        sourceName: source.source_name,
        message: result.error,
      });
    }
  }

  return summary;
}
