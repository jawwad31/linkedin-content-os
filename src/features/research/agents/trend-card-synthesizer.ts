import "server-only";

import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { loadStagePlaybook } from "@/lib/ai/playbooks/loader";
import { writeLlmLog } from "@/lib/llm/log";
import {
  getOpenRouterConfig,
  requestStructuredCompletion,
} from "@/lib/openrouter/client";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  getClientBusinessContext,
  type AdminClient,
  type ClientBusinessContext,
} from "./client-context";

const MAX_ITEMS_PER_RUN = 30;
const RECENT_CARDS_LIMIT = 20;
const SYNTHESIZER_FEATURE = "trend_card_synthesis";
const SYNTHESIZER_PROVIDER = "openrouter";

export const NOT_CONFIGURED_ERROR = "AI synthesis is not configured.";
const GENERIC_ERROR =
  "Could not synthesize TrendCards right now. Please try again.";
const NO_EVIDENCE_NOTE = "No relevant articles available to synthesize yet.";
const NO_NEW_CARDS_NOTE =
  "No new TrendCards were found from the current evidence.";

export type SynthesisSummary = {
  attemptedItemCount: number;
  signalsCreated: number;
  itemsMarkedUsed: number;
  synthesisErrorCount: number;
  note?: string;
};

export type SynthesizeForClientResult =
  | { ok: true; summary: SynthesisSummary }
  | { ok: false; reason: "not_configured" | "error"; message: string };

type SynthesizableItem = {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  sourceName: string | null;
  publishedAt: string | null;
};

type ExistingCard = {
  title: string;
  shift: string | null;
};

const trendCardSchema = z.object({
  title: z.string().trim().min(1).max(200),
  shift: z.string().trim().min(1).max(600),
  why_it_matters: z.string().trim().min(1).max(600),
  relevance_to_icp: z.string().trim().min(1).max(600),
  content_angle: z.string().trim().min(1).max(600),
  source_item_ids: z.array(z.string().uuid()).min(1),
  confidence_score: z.number().int().min(1).max(10),
});

const synthesisResponseSchema = z.object({
  trend_cards: z.array(trendCardSchema),
});

const SYNTHESIS_JSON_SCHEMA = {
  type: "object",
  properties: {
    trend_cards: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          shift: { type: "string" },
          why_it_matters: { type: "string" },
          relevance_to_icp: { type: "string" },
          content_angle: { type: "string" },
          source_item_ids: {
            type: "array",
            items: { type: "string" },
          },
          confidence_score: { type: "integer" },
        },
        required: [
          "title",
          "shift",
          "why_it_matters",
          "relevance_to_icp",
          "content_angle",
          "source_item_ids",
          "confidence_score",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["trend_cards"],
  additionalProperties: false,
};

/** Monday of the current ISO week, UTC, as a YYYY-MM-DD date string. */
function currentWeekOfUtc(): string {
  const now = new Date();
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  const monday = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysSinceMonday,
    ),
  );
  return monday.toISOString().slice(0, 10);
}

/**
 * Evidence pool for synthesis: status='relevant' only (never new, irrelevant,
 * used, or deleted), scoped by client_id, strongest evidence first
 * (relevance_score desc), oldest as tiebreak so nothing starves indefinitely.
 */
async function getRelevantItems(
  admin: AdminClient,
  clientId: string,
): Promise<SynthesizableItem[]> {
  const { data, error } = await admin
    .from("market_signal_items")
    .select("id, title, summary, url, source_name, published_at")
    .eq("client_id", clientId)
    .eq("status", "relevant")
    .is("deleted_at", null)
    .order("relevance_score", { ascending: false })
    .order("collected_at", { ascending: true })
    .limit(MAX_ITEMS_PER_RUN);

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    title: row.title,
    summary: row.summary,
    url: row.url,
    sourceName: row.source_name,
    publishedAt: row.published_at,
  }));
}

/** Titles + shifts only, for duplicate-avoidance context in the prompt. */
async function getRecentCardTitles(
  admin: AdminClient,
  clientId: string,
): Promise<ExistingCard[]> {
  const { data, error } = await admin
    .from("trend_cards")
    .select("title, shift")
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(RECENT_CARDS_LIMIT);

  if (error || !data) return [];

  return data.map((row) => ({
    title: row.title,
    shift: row.shift,
  }));
}

export async function buildTrendCardSynthesisPrompt(
  context: ClientBusinessContext,
  items: SynthesizableItem[],
  existingCards: ExistingCard[],
): Promise<{ system: string; user: string }> {
  const playbook = await loadStagePlaybook("research-synthesis");
  const system = [
    "You are a market intelligence synthesiser for a B2B founder's content system.",
    "Follow the production playbook below as binding methodology.",
    playbook,
    "Given a set of relevant articles and a research brief, identify distinct market shifts and synthesise one TrendCard per shift.",
    "A TrendCard must have:",
    "title: Short name for the market shift (10 words or fewer).",
    "shift: 1-2 sentences describing what is changing in the market.",
    "why_it_matters: Why this shift matters to buyers in the ICP.",
    "relevance_to_icp: How this shift affects the target customer specifically.",
    "content_angle: The best angle for the founder to take a public POV on this shift.",
    "confidence_score: Integer 1-10 (10 = strong signal from multiple sources).",
    "source_item_ids: List of article ids that support this trend card — only ids from the supplied articles, never invented.",
    "Do NOT generate a TrendCard per article — group related articles into one card.",
    "Do NOT generate generic trends that could apply to any industry.",
    "Only generate TrendCards for shifts you can defend with the provided article evidence. Do not invent facts, metrics, customer results, or quotes.",
    "Every TrendCard MUST cite at least one article id from the provided list in source_item_ids — a card without source evidence will be discarded.",
    "existing_trend_cards lists TrendCards already created for this client — do NOT generate a card covering the same shift again, even reworded. Only genuinely new shifts.",
    "Aim for 2-5 TrendCards per batch. Returning fewer (or none) is better than duplicating or inventing.",
    "Respond with strict JSON only, matching exactly this shape:",
    '{"trend_cards":[{"title":"short specific title","shift":"...","why_it_matters":"...","relevance_to_icp":"...","content_angle":"...","source_item_ids":["<uuid>"],"confidence_score":1-10}]}',
  ].join(" ");

  const user = JSON.stringify({
    client_context: {
      industry: context.industry,
      business_description: context.businessDescription,
      primary_icp: context.primaryIcp,
      main_offer: context.mainOffer,
      research_keywords: context.researchKeywords,
      banned_topics: context.bannedTopics,
    },
    existing_trend_cards: existingCards.map((card) => ({
      title: card.title,
      shift: card.shift,
    })),
    articles: items.map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary ? item.summary.slice(0, 800) : null,
      url: item.url,
      source_name: item.sourceName,
      published_at: item.publishedAt,
    })),
  });

  return { system, user };
}

function formatSynthesisNote(
  attemptedItemCount: number,
  cardsCreated: number,
  synthesisErrorCount: number,
): string | undefined {
  if (attemptedItemCount === 0) {
    return NO_EVIDENCE_NOTE;
  }
  if (cardsCreated === 0 && synthesisErrorCount === 0) {
    return NO_NEW_CARDS_NOTE;
  }
  if (cardsCreated === 0 && synthesisErrorCount > 0) {
    return "TrendCard synthesis could not complete. The available evidence was not fully evaluated.";
  }
  if (cardsCreated > 0 && synthesisErrorCount === 0) {
    return undefined;
  }
  if (cardsCreated > 0 && synthesisErrorCount > 0) {
    return "Some synthesis work could not complete.";
  }
  return undefined;
}

/**
 * Synthesizes evidence-backed TrendCards from a client's currently
 * `relevant` market_signal_items (Feature 17's classifier output). A single
 * OpenRouter call per run (no sub-batching — kept simple), capped at
 * MAX_ITEMS_PER_RUN items. Never throws — a misconfigured/failed/invalid
 * LLM call is reported via the returned summary, never as an unhandled
 * error, so it never corrupts an already-successful collect/classify run.
 *
 * The summary keeps the signalsCreated field name so research_runs'
 * signals_created column and the run summary shape stay stable across the
 * market_signals -> trend_cards rename.
 */
export async function synthesizeTrendCardsForClient(
  clientId: string,
  userId: string | null = null,
): Promise<SynthesizeForClientResult> {
  const config = getOpenRouterConfig("OPENROUTER_RESEARCH_MODEL");
  if (!config) {
    return { ok: false, reason: "not_configured", message: NOT_CONFIGURED_ERROR };
  }

  const admin = createAdminClient();

  const context = await getClientBusinessContext(admin, clientId);
  if (!context) {
    // Not configured is a benign, expected ops state (no audit noise — see
    // NOT_CONFIGURED_ERROR above). A real failure to load context is worth
    // an audit trail entry.
    await writeAuditLog({
      clientId,
      userId,
      action: "research_synthesis_failed",
      entityType: "trend_card",
      metadata: {
        attempted_item_count: 0,
        cards_created: 0,
        items_marked_used: 0,
        synthesis_error_count: 0,
      },
    });
    return { ok: false, reason: "error", message: GENERIC_ERROR };
  }

  const items = await getRelevantItems(admin, clientId);
  if (items.length === 0) {
    return {
      ok: true,
      summary: {
        attemptedItemCount: 0,
        signalsCreated: 0,
        itemsMarkedUsed: 0,
        synthesisErrorCount: 0,
        note: NO_EVIDENCE_NOTE,
      },
    };
  }

  const existingCards = await getRecentCardTitles(admin, clientId);
  const { system, user } = await buildTrendCardSynthesisPrompt(
    context,
    items,
    existingCards,
  );

  const result = await requestStructuredCompletion(
    config,
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    synthesisResponseSchema,
    SYNTHESIS_JSON_SCHEMA,
    "trend-card-synthesis",
    {
      timeoutMs: 90_000,
      maxTokens: 2500,
      temperature: 0.2,
    },
    clientId,
    userId,
    SYNTHESIZER_FEATURE,
  );

  let cardsCreated = 0;
  let itemsMarkedUsed = 0;
  let synthesisErrorCount = 0;

  if (!result.ok) {
    synthesisErrorCount = 1;
  } else {
    const validItemIds = new Set(items.map((item) => item.id));
    const seenTitles = new Set(
      existingCards.map((card) => card.title.trim().toLowerCase()),
    );
    const weekOf = currentWeekOfUtc();

    for (const card of result.data.trend_cards) {
          const filteredIds = Array.from(
            new Set(
              card.source_item_ids.filter((id) => validItemIds.has(id)),
            ),
          );

          if (filteredIds.length === 0) {
            synthesisErrorCount += 1;
            await writeLlmLog({
              clientId,
              userId,
              provider: SYNTHESIZER_PROVIDER,
              model: config.model,
              feature: SYNTHESIZER_FEATURE,
              status: "error",
              errorType: "invalid_source_ids",
            });
            continue;
          }

          const normalizedTitle = card.title.trim().toLowerCase();
          if (seenTitles.has(normalizedTitle)) {
            // Exact-duplicate title: silently skipped, not an error — this
            // is dedup working as intended, not a failure.
            continue;
          }

          const { data: inserted, error: insertError } = await admin
            .from("trend_cards")
            .insert({
              client_id: clientId,
              title: card.title.trim(),
              shift: card.shift.trim(),
              why_it_matters: card.why_it_matters.trim(),
              relevance_to_icp: card.relevance_to_icp.trim(),
              // Old-blueprint card shape: founder_pov/evidence are no longer
              // generated (the sources list on the card is the evidence).
              founder_pov: null,
              content_angle: card.content_angle.trim(),
              evidence: null,
              source_item_ids_json: filteredIds,
              confidence_score: card.confidence_score,
              week_of: weekOf,
              founder_take: null,
              approved_for_ideas: false,
            })
            .select("id")
            .single();

          if (insertError || !inserted) {
            synthesisErrorCount += 1;
            await writeLlmLog({
              clientId,
              userId,
              provider: SYNTHESIZER_PROVIDER,
              model: config.model,
              feature: SYNTHESIZER_FEATURE,
              status: "error",
              errorType: "database_insert_failure",
            });
            continue;
          }

          cardsCreated += 1;
          seenTitles.add(normalizedTitle);

          const { data: updatedItems, error: updateError } = await admin
            .from("market_signal_items")
            .update({ status: "used" })
            .eq("client_id", clientId)
            .in("id", filteredIds)
            .eq("status", "relevant")
            .select("id");

          if (updateError) {
            // The card row already exists and is real — do not roll it
            // back and do not count this as a synthesis error (the card
            // itself succeeded; only this bookkeeping update lagged). The
            // accepted consequence: these items could be cited again by a
            // future synthesis run.
            console.error(
              "[trend-card-synthesizer] Could not mark source items used.",
            );
          } else {
            itemsMarkedUsed += updatedItems?.length ?? 0;
          }

          await writeAuditLog({
            clientId,
            userId,
            action: "trend_card_created",
            entityType: "trend_card",
            entityId: inserted.id,
            metadata: {
              source_item_count: filteredIds.length,
              confidence_score: card.confidence_score,
            },
          });
        }
    }

  await writeAuditLog({
    clientId,
    userId,
    action: "research_synthesis_completed",
    entityType: "trend_card",
    metadata: {
      attempted_item_count: items.length,
      cards_created: cardsCreated,
      items_marked_used: itemsMarkedUsed,
      synthesis_error_count: synthesisErrorCount,
    },
  });

  return {
    ok: true,
    summary: {
      attemptedItemCount: items.length,
      signalsCreated: cardsCreated,
      itemsMarkedUsed,
      synthesisErrorCount,
      note: formatSynthesisNote(items.length, cardsCreated, synthesisErrorCount),
    },
  };
}
