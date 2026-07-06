import "server-only";

import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { writeLlmLog } from "@/lib/llm/log";
import {
  getOpenRouterConfig,
  requestOpenRouterCompletion,
} from "@/lib/openrouter/client";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  getClientBusinessContext,
  type AdminClient,
  type ClientBusinessContext,
} from "./client-context";

const MAX_ITEMS_PER_RUN = 30;
const RECENT_SIGNALS_LIMIT = 20;
const SYNTHESIZER_FEATURE = "research_signal_synthesis";
const SYNTHESIZER_PROVIDER = "openrouter";

export const NOT_CONFIGURED_ERROR = "AI synthesis is not configured.";
const GENERIC_ERROR =
  "Could not synthesize Market Signals right now. Please try again.";
const NO_EVIDENCE_NOTE = "No relevant articles available to synthesize yet.";
const NO_NEW_SIGNALS_NOTE =
  "No new Market Signals were found from the current evidence.";

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

type ExistingSignal = {
  title: string;
  signalSummary: string | null;
};

const synthesisSignalSchema = z.object({
  title: z.string().trim().min(1).max(200),
  signal_summary: z.string().trim().min(1).max(600),
  why_buyers_care: z.string().trim().min(1).max(600),
  content_angles: z.array(z.string().trim().min(1).max(200)).min(1).max(6),
  proof_notes: z.string().trim().min(1).max(600),
  source_item_ids: z.array(z.string().uuid()).min(1),
  confidence_score: z.number().int().min(1).max(10),
});

const synthesisResponseSchema = z.object({
  signals: z.array(synthesisSignalSchema),
});

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

/** Titles + summaries only, for duplicate-avoidance context in the prompt. */
async function getRecentSignalTitles(
  admin: AdminClient,
  clientId: string,
): Promise<ExistingSignal[]> {
  const { data, error } = await admin
    .from("market_signals")
    .select("title, signal_summary")
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(RECENT_SIGNALS_LIMIT);

  if (error || !data) return [];

  return data.map((row) => ({
    title: row.title,
    signalSummary: row.signal_summary,
  }));
}

function buildPrompt(
  context: ClientBusinessContext,
  items: SynthesizableItem[],
  existingSignals: ExistingSignal[],
): { system: string; user: string } {
  const system = [
    "You are a Market Signal synthesis assistant for a B2B content operating system.",
    "You group relevant, already-classified articles into evidence-backed Market Signals for one client's ICP and content strategy.",
    "Every source_item_ids entry must reference only an id from the supplied articles — never invent an id.",
    "Treat each article's title/summary as unverified context, not proof. Do not claim a signal is proven beyond what the cited articles' titles/summaries actually support. Do not invent facts, metrics, customer results, founder stories, or quotes.",
    "Prefer grouping multiple related articles into one stronger signal rather than one signal per article. Do not create a signal from a single generic or off-topic article.",
    "existing_signals lists Market Signals already created for this client (title + summary only). Do not propose a new signal that duplicates or closely restates any of them.",
    "It is correct and expected to return an empty signals array when the evidence is weak or nothing new and evidence-backed exists — do not manufacture a generic trend just to produce output.",
    "confidence_score (1-10) should reflect how strong and specific the cited evidence is.",
    "content_angles should be practical content directions, not final post copy.",
    "proof_notes must clearly state what is supported by the sources and what is not proven.",
    "Respond with strict JSON only, matching exactly this shape:",
    '{"signals":[{"title":"short specific title","signal_summary":"...","why_buyers_care":"...","content_angles":["...","..."],"proof_notes":"...","source_item_ids":["<uuid>"],"confidence_score":1-10}]}',
  ].join(" ");

  const user = JSON.stringify({
    client_context: {
      industry: context.industry,
      business_description: context.businessDescription,
      primary_icp: context.primaryIcp,
      main_offer: context.mainOffer,
      core_pov: context.corePov,
      content_pillars: context.contentPillars,
      research_keywords: context.researchKeywords,
      banned_topics: context.bannedTopics,
    },
    existing_signals: existingSignals.map((signal) => ({
      title: signal.title,
      signal_summary: signal.signalSummary,
    })),
    articles: items.map((item) => ({
      id: item.id,
      title: item.title,
      summary: item.summary,
      url: item.url,
      source_name: item.sourceName,
      published_at: item.publishedAt,
    })),
  });

  return { system, user };
}

/**
 * Synthesizes evidence-backed Market Signals from a client's currently
 * `relevant` market_signal_items (Feature 17's classifier output). A single
 * OpenRouter call per run (no sub-batching — kept simple), capped at
 * MAX_ITEMS_PER_RUN items. Never throws — a misconfigured/failed/invalid
 * LLM call is reported via the returned summary, never as an unhandled
 * error, so it never corrupts an already-successful collect/classify run.
 */
export async function synthesizeMarketSignalsForClient(
  clientId: string,
  userId: string | null = null,
): Promise<SynthesizeForClientResult> {
  const config = getOpenRouterConfig();
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
      entityType: "market_signal",
      metadata: {
        attempted_item_count: 0,
        signals_created: 0,
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

  const existingSignals = await getRecentSignalTitles(admin, clientId);
  const { system, user } = buildPrompt(context, items, existingSignals);

  const completion = await requestOpenRouterCompletion(config, [
    { role: "system", content: system },
    { role: "user", content: user },
  ]);

  let signalsCreated = 0;
  let itemsMarkedUsed = 0;
  let synthesisErrorCount = 0;

  if (!completion.ok) {
    await writeLlmLog({
      clientId,
      userId,
      provider: SYNTHESIZER_PROVIDER,
      model: config.model,
      feature: SYNTHESIZER_FEATURE,
      status: "error",
      errorType: completion.errorType,
    });
    synthesisErrorCount = 1;
  } else {
    let parsed: unknown;
    let parseFailed = false;
    try {
      parsed = JSON.parse(completion.content);
    } catch {
      parseFailed = true;
    }

    if (parseFailed) {
      await writeLlmLog({
        clientId,
        userId,
        provider: SYNTHESIZER_PROVIDER,
        model: config.model,
        feature: SYNTHESIZER_FEATURE,
        status: "error",
        errorType: "invalid_json",
        tokenInputCount: completion.inputTokens,
        tokenOutputCount: completion.outputTokens,
      });
      synthesisErrorCount = 1;
    } else {
      const validation = synthesisResponseSchema.safeParse(parsed);
      if (!validation.success) {
        await writeLlmLog({
          clientId,
          userId,
          provider: SYNTHESIZER_PROVIDER,
          model: config.model,
          feature: SYNTHESIZER_FEATURE,
          status: "error",
          errorType: "invalid_schema",
          tokenInputCount: completion.inputTokens,
          tokenOutputCount: completion.outputTokens,
        });
        synthesisErrorCount = 1;
      } else {
        await writeLlmLog({
          clientId,
          userId,
          provider: SYNTHESIZER_PROVIDER,
          model: config.model,
          feature: SYNTHESIZER_FEATURE,
          status: "success",
          tokenInputCount: completion.inputTokens,
          tokenOutputCount: completion.outputTokens,
        });

        const validItemIds = new Set(items.map((item) => item.id));
        const seenTitles = new Set(
          existingSignals.map((signal) => signal.title.trim().toLowerCase()),
        );

        for (const signal of validation.data.signals) {
          const filteredIds = Array.from(
            new Set(
              signal.source_item_ids.filter((id) => validItemIds.has(id)),
            ),
          );

          if (filteredIds.length === 0) {
            // A signal must always cite at least one real evidence item —
            // Zod only validates shape (uuid strings), not membership in
            // the batch actually sent, so this app-level check is the real
            // "no signal without evidence" enforcement.
            synthesisErrorCount += 1;
            continue;
          }

          const normalizedTitle = signal.title.trim().toLowerCase();
          if (seenTitles.has(normalizedTitle)) {
            // Exact-duplicate title: silently skipped, not an error — this
            // is dedup working as intended, not a failure.
            continue;
          }

          const { data: inserted, error: insertError } = await admin
            .from("market_signals")
            .insert({
              client_id: clientId,
              title: signal.title.trim(),
              signal_summary: signal.signal_summary.trim(),
              why_buyers_care: signal.why_buyers_care.trim(),
              content_angles: signal.content_angles,
              proof_notes: signal.proof_notes.trim(),
              source_item_ids_json: filteredIds,
              confidence_score: signal.confidence_score,
              founder_take: null,
              approved_for_ideas: false,
            })
            .select("id")
            .single();

          if (insertError || !inserted) {
            // Insert failing leaves the source items untouched (still
            // 'relevant') — nothing lost, they're eligible again next run.
            synthesisErrorCount += 1;
            continue;
          }

          signalsCreated += 1;
          seenTitles.add(normalizedTitle);

          const { data: updatedItems, error: updateError } = await admin
            .from("market_signal_items")
            .update({ status: "used" })
            .eq("client_id", clientId)
            .in("id", filteredIds)
            .eq("status", "relevant")
            .select("id");

          if (updateError) {
            // The signal row already exists and is real — do not roll it
            // back and do not count this as a synthesis error (the signal
            // itself succeeded; only this bookkeeping update lagged). The
            // accepted consequence: these items could be cited again by a
            // future synthesis run.
            console.error(
              "[market-signal-synthesizer] Could not mark source items used.",
            );
          } else {
            itemsMarkedUsed += updatedItems?.length ?? 0;
          }

          await writeAuditLog({
            clientId,
            userId,
            action: "market_signal_created",
            entityType: "market_signal",
            entityId: inserted.id,
            metadata: {
              source_item_count: filteredIds.length,
              confidence_score: signal.confidence_score,
            },
          });
        }
      }
    }
  }

  await writeAuditLog({
    clientId,
    userId,
    action: "research_synthesis_completed",
    entityType: "market_signal",
    metadata: {
      attempted_item_count: items.length,
      signals_created: signalsCreated,
      items_marked_used: itemsMarkedUsed,
      synthesis_error_count: synthesisErrorCount,
    },
  });

  return {
    ok: true,
    summary: {
      attemptedItemCount: items.length,
      signalsCreated,
      itemsMarkedUsed,
      synthesisErrorCount,
      note: signalsCreated === 0 ? NO_NEW_SIGNALS_NOTE : undefined,
    },
  };
}
