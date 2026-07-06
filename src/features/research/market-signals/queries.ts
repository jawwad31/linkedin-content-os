import "server-only";

import { createClient } from "@/lib/supabase/server";

export type MarketSignal = {
  id: string;
  title: string;
  signalSummary: string | null;
  whyBuyersCare: string | null;
  contentAngles: string[];
  proofNotes: string | null;
  sourceItemCount: number;
  confidenceScore: number | null;
  founderTake: string | null;
  approvedForIdeas: boolean;
  createdAt: string;
};

type MarketSignalRow = {
  id: string;
  title: string;
  signal_summary: string | null;
  why_buyers_care: string | null;
  content_angles: unknown;
  proof_notes: string | null;
  source_item_ids_json: unknown;
  confidence_score: number | null;
  founder_take: string | null;
  approved_for_ideas: boolean;
  created_at: string;
};

export type RecentMarketSignalsResult =
  | { ok: true; signals: MarketSignal[] }
  | { ok: false };

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

/**
 * Most recently synthesized Market Signals for one client, newest first.
 * Read-only — no founder-take editing, no approve-for-ideas action here
 * yet. Scoped by client_id; RLS's market_signals_select_accepted_access
 * policy is the backstop, not the primary access gate (the [client_id]
 * layout already verifies accepted access before this ever runs).
 */
export async function getRecentMarketSignals(
  clientId: string,
  limit = 20,
): Promise<RecentMarketSignalsResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("market_signals")
    .select(
      "id, title, signal_summary, why_buyers_care, content_angles, proof_notes, source_item_ids_json, confidence_score, founder_take, approved_for_ideas, created_at",
    )
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<MarketSignalRow[]>();

  if (error) return { ok: false };

  return {
    ok: true,
    signals: data.map((row) => ({
      id: row.id,
      title: row.title,
      signalSummary: row.signal_summary,
      whyBuyersCare: row.why_buyers_care,
      contentAngles: toStringArray(row.content_angles),
      proofNotes: row.proof_notes,
      sourceItemCount: Array.isArray(row.source_item_ids_json)
        ? row.source_item_ids_json.length
        : 0,
      confidenceScore: row.confidence_score,
      founderTake: row.founder_take,
      approvedForIdeas: row.approved_for_ideas,
      createdAt: row.created_at,
    })),
  };
}
