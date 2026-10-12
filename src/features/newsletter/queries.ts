import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getContentBankEntries } from "@/features/content-bank/queries";
import {
  normalizeQa,
  type Edition,
  type EditionSummary,
  type EditionVersion,
  type NewsletterSource,
  type Plan,
  type SourceOption,
} from "./contracts";

type Db = Awaited<ReturnType<typeof createClient>>;

/** Name, outline status and QA result for each edition, from its current version only. */
async function summarize(
  db: Db,
  clientId: string,
  editions: Edition[],
): Promise<EditionSummary[]> {
  if (!editions.length) return [];
  const rows = await db
    .from("newsletter_versions")
    .select("edition_id,revision,qa,name:payload->>title,plan_status:payload->plan->>status")
    .eq("client_id", clientId)
    .in(
      "edition_id",
      editions.map((e) => e.id),
    )
    .returns<
      {
        edition_id: string;
        revision: number;
        qa: unknown;
        name: string | null;
        plan_status: Plan["status"] | null;
      }[]
    >();
  if (rows.error) throw new Error("NEWSLETTER_UNAVAILABLE");
  const current = new Map(
    (rows.data ?? []).map((r) => [`${r.edition_id}:${r.revision}`, r]),
  );
  return editions.map((e) => {
    const v = current.get(`${e.id}:${e.revision}`);
    const qa = normalizeQa(v?.qa);
    return {
      ...e,
      name: v?.name ?? "Untitled edition",
      planStatus: v?.plan_status ?? null,
      hasQa: !!qa,
      qaDecision: qa?.decision ?? null,
      qaNotes: qa?.issues.length ?? 0,
    };
  });
}

export async function getNewsletterData(clientId: string, editionId?: string) {
  const db = await createClient();
  const editions = await db
    .from("newsletter_editions")
    .select(
      "id,revision,status,approved_revision,outline_revision,publication_url,published_on,created_at",
    )
    .eq("client_id", clientId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(50)
    .returns<Edition[]>();
  if (editions.error) throw new Error("NEWSLETTER_UNAVAILABLE");
  const summaries = await summarize(db, clientId, editions.data ?? []);
  const id = editionId;
  let edition = editions.data?.find((e) => e.id === id) ?? null;
  if (editionId && !edition) {
    const row = await db
      .from("newsletter_editions")
      .select(
        "id,revision,status,approved_revision,outline_revision,publication_url,published_on,created_at",
      )
      .eq("client_id", clientId)
      .eq("id", editionId)
      .is("deleted_at", null)
      .maybeSingle<Edition>();
    if (row.error) throw new Error("NEWSLETTER_UNAVAILABLE");
    edition = row.data;
  }
  const versions = edition
    ? await db
        .from("newsletter_versions")
        .select("revision,payload,qa,evidence,created_at")
        .eq("client_id", clientId)
        .eq("edition_id", edition.id)
        .order("revision", { ascending: false })
        .returns<EditionVersion[]>()
    : { data: [], error: null };
  const sources = edition
    ? await db
        .from("newsletter_sources")
        .select("source_id,source_type,snapshot,content_hash,usage_id")
        .eq("client_id", clientId)
        .eq("edition_id", edition.id)
        .returns<NewsletterSource[]>()
    : { data: [], error: null };
  if (versions.error || sources.error)
    throw new Error("NEWSLETTER_UNAVAILABLE");
  const history: NonNullable<NewsletterSource["usageHistory"]> = [];
  if (sources.data?.length) {
    for (let offset = 0; ; offset += 500) {
      const rows = await db
        .from("source_usage")
        .select("id,status,channel,newsletter_id,post_id,source_id,created_at")
        .eq("client_id", clientId)
        .in(
          "source_id",
          sources.data.map((s) => s.source_id),
        )
        .order("created_at")
        .order("id")
        .range(offset, offset + 499);
      if (rows.error) throw new Error("NEWSLETTER_HISTORY_UNAVAILABLE");
      history.push(...(rows.data ?? []));
      if ((rows.data?.length ?? 0) < 500) break;
    }
  }
  return {
    editions: summaries,
    edition,
    versions: versions.data ?? [],
    sources: (sources.data ?? []).map((source) => ({
      ...source,
      usageHistory: history.filter((row) => row.source_id === source.source_id),
    })),
  };
}
export async function getNewsletterOptions(
  clientId: string,
): Promise<SourceOption[]> {
  // Research findings reach a newsletter through the Content Bank: save a finding
  // there as a trend reaction first. Editions that already hold a finding keep it.
  const bank = await getContentBankEntries(clientId);
  if (!bank.ok) throw new Error("NEWSLETTER_SOURCES_UNAVAILABLE");
  return [
    ...bank.entries
      .filter(
        (e) =>
          e.readiness === "ready" &&
          (e.sourceType !== "content_resource" || e.commentGateApproved),
      )
      .map((e) => ({
        id: e.id,
        type: e.sourceType,
        title: e.title,
        allowReuse: e.allowReuse,
        usageStatus: e.usageStatus,
        usageCount: e.usageCount,
        reuseConfirmed: false,
        kind:
          e.sourceType === "content_resource"
            ? ("resource" as const)
            : e.entryType === "trend_reaction"
              ? ("trend_reaction" as const)
              : ("experience" as const),
      })),
  ];
}
