import "server-only";

import { createClient } from "@/lib/supabase/server";

export type RssSource = {
  id: string;
  sourceName: string;
  feedUrl: string;
  category: string | null;
  active: boolean;
  lastCheckedAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
};

type RssSourceRow = {
  id: string;
  source_name: string;
  feed_url: string;
  category: string | null;
  active: boolean;
  last_checked_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
};

export type RssSourcesResult =
  | { ok: true; sources: RssSource[] }
  | { ok: false };

/**
 * Active and inactive (but not archived) RSS sources for one client, newest
 * first. Scoped by client_id; RLS's rss_sources_select_accepted_access
 * policy is the backstop, not the primary access gate (the [client_id]
 * layout already verifies accepted access before this ever runs).
 */
export async function getRssSources(
  clientId: string,
): Promise<RssSourcesResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("rss_sources")
    .select(
      "id, source_name, feed_url, category, active, last_checked_at, last_success_at, last_error, created_at, updated_at",
    )
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .returns<RssSourceRow[]>();

  if (error) return { ok: false };

  return {
    ok: true,
    sources: data.map((row) => ({
      id: row.id,
      sourceName: row.source_name,
      feedUrl: row.feed_url,
      category: row.category,
      active: row.active,
      lastCheckedAt: row.last_checked_at,
      lastSuccessAt: row.last_success_at,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  };
}
