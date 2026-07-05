import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

import { collectSource } from "./collect-source";

export type CollectForClientSummary = {
  sourcesProcessed: number;
  totalFetched: number;
  totalNew: number;
  skippedDuplicate: number;
  skippedInvalid: number;
  skippedError: number;
  errors: { sourceId: string; sourceName: string; message: string }[];
};

/**
 * Collects every active, non-archived RSS source for one client. Uses the
 * service-role client: this has no end-user session (it's called by a
 * worker or a trusted server route, not directly by browser code), so RLS's
 * owner/editor write policies don't apply — this function is the trusted
 * caller, scoped to one client_id throughout.
 */
export async function collectForClient(
  clientId: string,
): Promise<CollectForClientSummary> {
  const admin = createAdminClient();

  const summary: CollectForClientSummary = {
    sourcesProcessed: 0,
    totalFetched: 0,
    totalNew: 0,
    skippedDuplicate: 0,
    skippedInvalid: 0,
    skippedError: 0,
    errors: [],
  };

  const { data: sources, error } = await admin
    .from("rss_sources")
    .select("id, client_id, source_name, feed_url")
    .eq("client_id", clientId)
    .eq("active", true)
    .is("deleted_at", null);

  if (error || !sources) {
    return summary;
  }

  for (const source of sources) {
    const result = await collectSource(admin, {
      id: source.id,
      clientId: source.client_id,
      sourceName: source.source_name,
      feedUrl: source.feed_url,
    });

    summary.sourcesProcessed += 1;
    summary.totalFetched += result.fetched;
    summary.totalNew += result.inserted;
    summary.skippedDuplicate += result.skippedDuplicate;
    summary.skippedInvalid += result.skippedInvalid;

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
