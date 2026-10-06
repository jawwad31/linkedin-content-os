import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  ContentBankCategory,
  ContentBankEntry,
  ContentBankReadiness,
  LeadMagnetType,
  UsageStatus,
} from "./schemas";
import { getSourceUsageHistory } from "./usage-service";

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
  status: string;
};

export async function getContentBankEntries(
  clientId: string,
  filter?: ContentBankListFilter,
): Promise<ContentBankListResult> {
  const supabase = await createClient();

  // 1. Fetch founder_experiences
  const { data: feRows, error: feError } = await supabase
    .from("founder_experiences")
    .select(
      "id, client_id, title, category, readiness, allow_reuse, raw_notes, takeaway, what_happened, what_was_learned, what_changed, why_it_matters, created_at, updated_at",
    )
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .returns<FounderExperienceDbRow[]>();

  if (feError) {
    return { ok: false, error: "Failed to load founder experiences." };
  }

  // 2. Fetch content_resources
  const { data: crRows, error: crError } = await supabase
    .from("content_resources")
    .select(
      "id, client_id, title, category, readiness, allow_reuse, raw_notes, resource_type, description, problem_solved, target_use_case, keyword, delivery_url, delivery_instructions, active, comment_gate_approved, created_at, updated_at",
    )
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .returns<ContentResourceDbRow[]>();

  if (crError) {
    return { ok: false, error: "Failed to load content resources." };
  }

  // 3. Fetch source_usage for this client to derive usage statuses
  const { data: usageRows, error: usageError } = await supabase
    .from("source_usage")
    .select("source_id, status")
    .eq("client_id", clientId)
    .returns<SourceUsageDbRow[]>();

  const usageMap = new Map<string, { status: UsageStatus; count: number }>();

  if (!usageError && usageRows) {
    for (const u of usageRows) {
      const existing = usageMap.get(u.source_id) ?? {
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

      usageMap.set(u.source_id, existing);
    }
  }

  const entries: ContentBankEntry[] = [];

  // Map founder experiences
  for (const row of feRows ?? []) {
    const usage = usageMap.get(row.id) ?? { status: "unused", count: 0 };
    const category: ContentBankCategory = row.category ?? "observation";
    const readiness: ContentBankReadiness = row.readiness ?? "ready";

    entries.push({
      id: row.id,
      clientId: row.client_id,
      sourceType: "founder_experience",
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
    const usage = usageMap.get(row.id) ?? { status: "unused", count: 0 };
    const readiness: ContentBankReadiness =
      row.readiness ?? (row.active ? "ready" : "archived");

    entries.push({
      id: row.id,
      clientId: row.client_id,
      sourceType: "content_resource",
      category: "lead_magnet",
      title: row.title,
      rawNotes: row.raw_notes ?? row.description ?? null,
      takeaway: row.problem_solved ?? null,
      whatHappened: row.target_use_case ?? null,
      whatWasLearned: null,
      whatChanged: null,
      whyItMatters: null,
      resourceType: (row.resource_type as LeadMagnetType | null) ?? "other",
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

  const usageHistory = await getSourceUsageHistory(clientId, sourceId);

  return {
    entry,
    usageHistory,
  };
}
