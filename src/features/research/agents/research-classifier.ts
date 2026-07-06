import "server-only";

import { z } from "zod";

import { writeAuditLog } from "@/lib/audit/log";
import { writeLlmLog } from "@/lib/llm/log";
import {
  getOpenRouterConfig,
  requestOpenRouterCompletion,
} from "@/lib/openrouter/client";
import type { OpenRouterConfig } from "@/lib/openrouter/types";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_ITEMS_PER_RUN = 50;
const BATCH_SIZE = 12;
const CLASSIFIER_FEATURE = "research_classification";
const CLASSIFIER_PROVIDER = "openrouter";

export const NOT_CONFIGURED_ERROR = "AI classification is not configured.";
const GENERIC_ERROR = "Could not classify articles right now. Please try again.";

export type ClassificationSummary = {
  classifiedCount: number;
  relevantCount: number;
  irrelevantCount: number;
  errorCount: number;
};

export type ClassifyForClientResult =
  | { ok: true; summary: ClassificationSummary }
  | { ok: false; reason: "not_configured" | "error"; message: string };

type AdminClient = ReturnType<typeof createAdminClient>;

type ClientBusinessContext = {
  industry: string | null;
  businessDescription: string | null;
  primaryIcp: string | null;
  mainOffer: string | null;
  corePov: string | null;
  contentPillars: unknown;
  researchKeywords: unknown;
  bannedTopics: unknown;
};

type ClassifiableItem = {
  id: string;
  title: string;
  summary: string | null;
  url: string;
  sourceName: string | null;
  publishedAt: string | null;
};

const classificationItemSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["relevant", "irrelevant"]),
  relevance_score: z.number().int().min(1).max(10),
  classification_reason: z.string().trim().min(1).max(400),
});

const classificationResponseSchema = z.object({
  items: z.array(classificationItemSchema),
});

async function getClientBusinessContext(
  admin: AdminClient,
  clientId: string,
): Promise<ClientBusinessContext | null> {
  const { data, error } = await admin
    .from("clients")
    .select(
      "industry, business_description, primary_icp, main_offer, core_pov, content_pillars, research_keywords, banned_topics",
    )
    .eq("id", clientId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return null;

  return {
    industry: data.industry,
    businessDescription: data.business_description,
    primaryIcp: data.primary_icp,
    mainOffer: data.main_offer,
    corePov: data.core_pov,
    contentPillars: data.content_pillars,
    researchKeywords: data.research_keywords,
    bannedTopics: data.banned_topics,
  };
}

/**
 * Unclassified items for one client: status = 'new' only (never
 * re-classifies relevant/irrelevant/used items), scoped by client_id, not
 * deleted, capped at MAX_ITEMS_PER_RUN per run.
 */
async function getUnclassifiedItems(
  admin: AdminClient,
  clientId: string,
): Promise<ClassifiableItem[]> {
  const { data, error } = await admin
    .from("market_signal_items")
    .select("id, title, summary, url, source_name, published_at")
    .eq("client_id", clientId)
    .eq("status", "new")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
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

function buildPrompt(
  context: ClientBusinessContext,
  items: ClassifiableItem[],
): { system: string; user: string } {
  const system = [
    "You are a research classification assistant for a B2B content operating system.",
    "Classify each article for relevance to this client's ICP and content strategy.",
    'The status field must be exactly the word "relevant" or exactly the word "irrelevant" — no other value, category, or label is allowed, ever.',
    "Relevant means useful for this client's ICP/content strategy.",
    "Irrelevant means generic, off-topic, too broad, duplicate-like, not buyer-relevant, or not useful for content.",
    'Use relevance_score to express confidence within those two statuses: 1-3 is clearly irrelevant, 7-10 is clearly relevant, 4-6 is borderline — for a 4-6 score, still set status to "irrelevant" unless the context strongly supports "relevant".',
    "Do not invent facts. Do not claim an article proves anything beyond its title/summary. Treat article claims as unverified context, not proof.",
    "Respond with strict JSON only, matching exactly this shape:",
    '{"items":[{"id":"<item id>","status":"relevant"|"irrelevant","relevance_score":1-10,"classification_reason":"short safe explanation"}]}',
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

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

type BatchOutcome = {
  classified: number;
  relevant: number;
  irrelevant: number;
  errors: number;
};

/**
 * Classifies one batch. Never throws — an LLM/parse/validation failure for
 * this batch is logged safely and counted as errors, leaving every other
 * batch (and any already-classified items) untouched.
 */
async function classifyBatch(
  admin: AdminClient,
  clientId: string,
  userId: string | null,
  config: OpenRouterConfig,
  context: ClientBusinessContext,
  batch: ClassifiableItem[],
): Promise<BatchOutcome> {
  const validIds = new Set(batch.map((item) => item.id));
  const { system, user } = buildPrompt(context, batch);

  const completion = await requestOpenRouterCompletion(config, [
    { role: "system", content: system },
    { role: "user", content: user },
  ]);

  if (!completion.ok) {
    await writeLlmLog({
      clientId,
      userId,
      provider: CLASSIFIER_PROVIDER,
      model: config.model,
      feature: CLASSIFIER_FEATURE,
      status: "error",
      errorType: completion.errorType,
    });
    return { classified: 0, relevant: 0, irrelevant: 0, errors: batch.length };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(completion.content);
  } catch {
    await writeLlmLog({
      clientId,
      userId,
      provider: CLASSIFIER_PROVIDER,
      model: config.model,
      feature: CLASSIFIER_FEATURE,
      status: "error",
      errorType: "invalid_json",
      tokenInputCount: completion.inputTokens,
      tokenOutputCount: completion.outputTokens,
    });
    return { classified: 0, relevant: 0, irrelevant: 0, errors: batch.length };
  }

  const validation = classificationResponseSchema.safeParse(parsed);
  if (!validation.success) {
    await writeLlmLog({
      clientId,
      userId,
      provider: CLASSIFIER_PROVIDER,
      model: config.model,
      feature: CLASSIFIER_FEATURE,
      status: "error",
      errorType: "invalid_schema",
      tokenInputCount: completion.inputTokens,
      tokenOutputCount: completion.outputTokens,
    });
    return { classified: 0, relevant: 0, irrelevant: 0, errors: batch.length };
  }

  let relevant = 0;
  let irrelevant = 0;
  let classified = 0;
  const seenIds = new Set<string>();

  for (const item of validation.data.items) {
    // Unknown ids (not in this batch) are ignored; duplicates are ignored.
    if (!validIds.has(item.id) || seenIds.has(item.id)) continue;
    seenIds.add(item.id);

    const { data: updated, error } = await admin
      .from("market_signal_items")
      .update({
        status: item.status,
        relevance_score: item.relevance_score,
        classification_reason: item.classification_reason,
      })
      .eq("id", item.id)
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();

    if (error || !updated) continue;

    classified += 1;
    if (item.status === "relevant") relevant += 1;
    else irrelevant += 1;
  }

  // Items omitted by the model, or that failed to update, count as errors.
  const errors = batch.length - classified;

  await writeLlmLog({
    clientId,
    userId,
    provider: CLASSIFIER_PROVIDER,
    model: config.model,
    feature: CLASSIFIER_FEATURE,
    status: "success",
    tokenInputCount: completion.inputTokens,
    tokenOutputCount: completion.outputTokens,
  });

  return { classified, relevant, irrelevant, errors };
}

/**
 * Classifies up to MAX_ITEMS_PER_RUN unclassified ("new") market_signal_items
 * for one client, in small batches. Only classifies articles this client
 * already collected (Feature 13) — no scraping, no new sources, no Market
 * Signal synthesis. Fails safely (never throws) if OpenRouter isn't
 * configured or a batch fails outright.
 */
export async function classifyForClient(
  clientId: string,
  userId: string | null = null,
): Promise<ClassifyForClientResult> {
  const config = getOpenRouterConfig();
  if (!config) {
    return { ok: false, reason: "not_configured", message: NOT_CONFIGURED_ERROR };
  }

  const admin = createAdminClient();

  const context = await getClientBusinessContext(admin, clientId);
  if (!context) {
    // Not configured is a benign, expected ops state (no audit noise here —
    // see NOT_CONFIGURED_ERROR above). A real failure to load context is
    // worth an audit trail entry.
    await writeAuditLog({
      clientId,
      userId,
      action: "research_classification_failed",
      entityType: "market_signal_item",
      metadata: {
        classified_count: 0,
        relevant_count: 0,
        irrelevant_count: 0,
        error_count: 0,
      },
    });
    return { ok: false, reason: "error", message: GENERIC_ERROR };
  }

  const items = await getUnclassifiedItems(admin, clientId);
  if (items.length === 0) {
    return {
      ok: true,
      summary: {
        classifiedCount: 0,
        relevantCount: 0,
        irrelevantCount: 0,
        errorCount: 0,
      },
    };
  }

  const summary: ClassificationSummary = {
    classifiedCount: 0,
    relevantCount: 0,
    irrelevantCount: 0,
    errorCount: 0,
  };

  for (const batch of chunk(items, BATCH_SIZE)) {
    const result = await classifyBatch(admin, clientId, userId, config, context, batch);
    summary.classifiedCount += result.classified;
    summary.relevantCount += result.relevant;
    summary.irrelevantCount += result.irrelevant;
    summary.errorCount += result.errors;
  }

  await writeAuditLog({
    clientId,
    userId,
    action: "research_classification_completed",
    entityType: "market_signal_item",
    metadata: {
      classified_count: summary.classifiedCount,
      relevant_count: summary.relevantCount,
      irrelevant_count: summary.irrelevantCount,
      error_count: summary.errorCount,
    },
  });

  return { ok: true, summary };
}
