import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { MAX_ENTRIES_PER_FEED, SAFE_FEED_ERROR } from "./constants";
import { hashNormalizedUrl } from "./content-hash";
import { fetchFeed } from "./feed-fetch";
import { parseFeedEntries } from "./feed-parser";
import { normalizeUrl } from "./url-normalization";

export type CollectSourceInput = {
  id: string;
  clientId: string;
  sourceName: string;
  feedUrl: string;
};

export type CollectSourceResult = {
  fetched: number;
  inserted: number;
  skippedDuplicate: number;
  skippedInvalid: number;
  error: string | null;
};

const UNIQUE_VIOLATION = "23505";

/**
 * Collects one RSS source: fetch with timeout, parse entries, normalize +
 * hash each entry's URL, insert new market_signal_items rows (skipping
 * duplicates by the client_id + content_hash constraint), and update the
 * source's last_checked_at / last_success_at / last_error. Never throws — a
 * broken feed or malformed XML is recorded on the source row, not surfaced
 * as an unhandled error.
 */
export async function collectSource(
  admin: SupabaseClient,
  source: CollectSourceInput,
): Promise<CollectSourceResult> {
  const now = new Date().toISOString();
  const fetchResult = await fetchFeed(source.feedUrl);

  if (!fetchResult.ok) {
    await admin
      .from("rss_sources")
      .update({ last_checked_at: now, last_error: fetchResult.error })
      .eq("id", source.id)
      .eq("client_id", source.clientId);

    return {
      fetched: 0,
      inserted: 0,
      skippedDuplicate: 0,
      skippedInvalid: 0,
      error: fetchResult.error,
    };
  }

  let entries;
  try {
    entries = parseFeedEntries(fetchResult.body).slice(0, MAX_ENTRIES_PER_FEED);
  } catch {
    await admin
      .from("rss_sources")
      .update({ last_checked_at: now, last_error: SAFE_FEED_ERROR })
      .eq("id", source.id)
      .eq("client_id", source.clientId);

    return {
      fetched: 0,
      inserted: 0,
      skippedDuplicate: 0,
      skippedInvalid: 0,
      error: SAFE_FEED_ERROR,
    };
  }

  let inserted = 0;
  let skippedDuplicate = 0;
  let skippedInvalid = 0;

  for (const entry of entries) {
    const normalizedUrl = entry.url ? normalizeUrl(entry.url) : null;

    if (!entry.title || !normalizedUrl) {
      skippedInvalid += 1;
      continue;
    }

    const { error: insertError } = await admin.from("market_signal_items").insert({
      client_id: source.clientId,
      rss_source_id: source.id,
      title: entry.title,
      url: normalizedUrl,
      summary: entry.summary,
      published_at: entry.publishedAt,
      source_name: source.sourceName,
      content_hash: hashNormalizedUrl(normalizedUrl),
    });

    if (insertError) {
      if (insertError.code === UNIQUE_VIOLATION) {
        skippedDuplicate += 1;
      } else {
        skippedInvalid += 1;
      }
      continue;
    }

    inserted += 1;
  }

  await admin
    .from("rss_sources")
    .update({ last_checked_at: now, last_success_at: now, last_error: null })
    .eq("id", source.id)
    .eq("client_id", source.clientId);

  return {
    fetched: entries.length,
    inserted,
    skippedDuplicate,
    skippedInvalid,
    error: null,
  };
}
