import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  ContentBankCategory,
  ContentBankEntry,
  ContentBankReadiness,
  LeadMagnetType,
  UsageStatus,
} from "./schemas";
import type { ReactionType } from "@/features/research/trend-cards/schemas";
import type { SourceUsageRecord } from "./schemas";

export type ContentBankListFilter = {
  category?: ContentBankCategory;
  readiness?: ContentBankReadiness;
  usageStatus?: UsageStatus;
  search?: string;
};

export type ContentBankListResult =
  | { ok: true; entries: ContentBankEntry[] }
  | { ok: false; error: string };

type FounderExperienceDbRow = {
  id: string;
  client_id: string;
  title: string;
  entry_type: "work_log" | "trend_reaction";
  source_trend_card_id: string | null;
  source_research_finding_id: string | null;
  reaction_type: ReactionType | null;
  category: ContentBankCategory | null;
  readiness: ContentBankReadiness | null;
  allow_reuse: boolean | null;
  raw_notes: string | null;
  takeaway: string | null;
  what_happened: string | null;
  what_was_learned: string | null;
  what_changed: string | null;
  why_it_matters: string | null;
  created_at: string;
  updated_at: string;
};

type ContentResourceDbRow = {
  id: string;
  client_id: string;
  title: string;
  category: ContentBankCategory | null;
  readiness: ContentBankReadiness | null;
  allow_reuse: boolean | null;
  raw_notes: string | null;
  resource_type: string | null;
  description: string | null;
  problem_solved: string | null;
  target_use_case: string | null;
  keyword: string | null;
  delivery_url: string | null;
  delivery_instructions: string | null;
  active: boolean | null;
  comment_gate_approved: boolean | null;
  created_at: string;
  updated_at: string;
};

type SourceUsageDbRow = {
  source_id: string;
  source_type: "founder_experience" | "content_resource";
  status: string;
};

async function loadSourceRows<T>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "founder_experiences" | "content_resources",
  columns: string,
  clientId: string,
): Promise<T[] | null> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from(table).select(columns)
      .eq("client_id", clientId).is("deleted_at", null).order("id")
      .range(offset, offset + pageSize - 1).returns<T[]>();
    if (error || !data) return null;
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

export async function getContentBankEntries(
  clientId: string,
  filter?: ContentBankListFilter,
): Promise<ContentBankListResult> {
  const supabase = await createClient();

  // 1. Fetch founder_experiences
  const feRows = await loadSourceRows<FounderExperienceDbRow>(supabase, "founder_experiences",
    "id, client_id, title, entry_type, source_trend_card_id, source_research_finding_id, reaction_type, category, readiness, allow_reuse, raw_notes, takeaway, what_happened, what_was_learned, what_changed, why_it_matters, created_at, updated_at", clientId);
  if (!feRows) {
    return { ok: false, error: "Failed to load founder experiences." };
  }

  // 2. Fetch content_resources
  const crRows = await loadSourceRows<ContentResourceDbRow>(supabase, "content_resources",
    "id, client_id, title, category, readiness, allow_reuse, raw_notes, resource_type, description, problem_solved, target_use_case, keyword, delivery_url, delivery_instructions, active, comment_gate_approved, created_at, updated_at", clientId);
  if (!crRows) {
    return { ok: false, error: "Failed to load content resources." };
  }

  // 3. Fetch source_usage for this client to derive usage statuses
  const usageRows: SourceUsageDbRow[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("source_usage")
      .select("source_id, source_type, status").eq("client_id", clientId)
      .order("id").range(offset, offset + pageSize - 1)
      .returns<SourceUsageDbRow[]>();
    if (error || !data) {
      return { ok: false, error: "Could not load source usage. Refresh to try again." };
    }
    usageRows.push(...data);
    if (data.length < pageSize) break;
  }
  const usageMap = new Map<string, { status: UsageStatus; count: number }>();
  for (const u of usageRows) {
      const key = `${u.source_type}:${u.source_id}`;
      const existing = usageMap.get(key) ?? {
        status: "unused",
        count: 0,
      };

      if (u.status === "used" || u.status === "published") {
        existing.count += 1;
      }

      // Priority: published > used > reserved > unused
      if (u.status === "published") {
        existing.status = "published";
      } else if (u.status === "used" && existing.status !== "published") {
        existing.status = "used";
      } else if (
        u.status === "reserved" &&
        existing.status !== "published" &&
        existing.status !== "used"
      ) {
        existing.status = "reserved";
      }

      usageMap.set(key, existing);
  }

  const entries: ContentBankEntry[] = [];

  // Map founder experiences
  for (const row of feRows ?? []) {
    const usage = usageMap.get(`founder_experience:${row.id}`) ?? { status: "unused", count: 0 };
    const category: ContentBankCategory = row.category ?? "observation";
    const readiness: ContentBankReadiness = row.readiness ?? "ready";

    entries.push({
      id: row.id,
      clientId: row.client_id,
      sourceType: "founder_experience",
      entryType: row.entry_type,
      sourceTrendCardId: row.source_trend_card_id,
      sourceResearchFindingId: row.source_research_finding_id,
      reactionType: row.reaction_type,
      category,
      title: row.title,
      rawNotes: row.raw_notes ?? null,
      takeaway: row.takeaway ?? null,
      whatHappened: row.what_happened ?? null,
      whatWasLearned: row.what_was_learned ?? null,
      whatChanged: row.what_changed ?? null,
      whyItMatters: row.why_it_matters ?? null,
      resourceType: null,
      keyword: null,
      deliveryUrl: null,
      deliveryInstructions: null,
      commentGateApproved: false,
      readiness,
      allowReuse: Boolean(row.allow_reuse),
      usageStatus: usage.status,
      usageCount: usage.count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  // Map content resources
  for (const row of crRows ?? []) {
    const usage = usageMap.get(`content_resource:${row.id}`) ?? { status: "unused", count: 0 };
    const readiness: ContentBankReadiness =
      row.readiness ?? (row.active ? "ready" : "archived");

    entries.push({
      id: row.id,
      clientId: row.client_id,
      sourceType: "content_resource",
      category: "lead_magnet",
      title: row.title,
      rawNotes: row.raw_notes ?? null,
      takeaway: row.problem_solved ?? null,
      whatHappened: row.target_use_case ?? null,
      whatWasLearned: null,
      whatChanged: null,
      whyItMatters: null,
      resourceType: (row.resource_type as LeadMagnetType | null) ?? "other",
      description: row.description,
      problemSolved: row.problem_solved,
      targetUseCase: row.target_use_case,
      active: Boolean(row.active),
      keyword: row.keyword ?? null,
      deliveryUrl: row.delivery_url ?? null,
      deliveryInstructions: row.delivery_instructions ?? null,
      commentGateApproved: Boolean(row.comment_gate_approved),
      readiness,
      allowReuse: Boolean(row.allow_reuse),
      usageStatus: usage.status,
      usageCount: usage.count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }

  // Filter
  let filtered = entries;

  if (filter?.category) {
    filtered = filtered.filter((e) => e.category === filter.category);
  }

  if (filter?.readiness) {
    filtered = filtered.filter((e) => e.readiness === filter.readiness);
  }

  if (filter?.usageStatus) {
    filtered = filtered.filter((e) => e.usageStatus === filter.usageStatus);
  }

  if (filter?.search?.trim()) {
    const q = filter.search.toLowerCase().trim();
    filtered = filtered.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.rawNotes && e.rawNotes.toLowerCase().includes(q)) ||
        (e.takeaway && e.takeaway.toLowerCase().includes(q)) ||
        (e.whatHappened && e.whatHappened.toLowerCase().includes(q)),
    );
  }

  // Sort by updatedAt descending
  filtered.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return { ok: true, entries: filtered };
}

export async function getContentBankEntry(
  clientId: string,
  sourceId: string,
  sourceType: "founder_experience" | "content_resource",
) {
  const result = await getContentBankEntries(clientId);
  if (!result.ok) return null;

  const entry = result.entries.find(
    (e) => e.id === sourceId && e.sourceType === sourceType,
  );
  if (!entry) return null;

  return { entry };
}

export async function getContentBankUsageHistory(
  clientId: string,
  sourceId: string,
  sourceType: ContentBankEntry["sourceType"],
): Promise<{ ok: true; history: SourceUsageRecord[] } | { ok: false; error: string }> {
  const supabase = await createClient();
  const history: SourceUsageRecord[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.from("source_usage")
      .select("id, client_id, source_id, source_type, channel, status, content_idea_id, post_id, newsletter_id, angle, takeaway, created_at, updated_at")
      .eq("client_id", clientId).eq("source_id", sourceId).eq("source_type", sourceType)
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (error || !data) return { ok: false, error: "Could not load usage history. Try again." };
    history.push(...data.map((row) => ({
      id: row.id, clientId: row.client_id, sourceId: row.source_id,
      sourceType: row.source_type, channel: row.channel, status: row.status,
      contentIdeaId: row.content_idea_id, postId: row.post_id,
      newsletterId: row.newsletter_id,
      angle: row.angle, takeaway: row.takeaway,
      createdAt: row.created_at, updatedAt: row.updated_at,
    })));
    if (data.length < pageSize) return { ok: true, history };
  }
}
