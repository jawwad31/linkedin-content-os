import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getContentBankEntries } from "@/features/content-bank/queries";
import { storedFindingSchema } from "@/features/research/web-research/contracts";
import type {
  Edition,
  EditionVersion,
  NewsletterSource,
  SourceOption,
} from "./contracts";

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
  const id = editionId ?? editions.data?.[0]?.id;
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
    editions: editions.data ?? [],
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
  const db = await createClient();
  const bank = await getContentBankEntries(clientId);
  const findings = await db
    .from("research_findings")
    .select("id,payload")
    .eq("client_id", clientId)
    .eq("approval_status", "approved")
    .order("created_at", { ascending: false })
    .limit(100);
  if (!bank.ok || findings.error)
    throw new Error("NEWSLETTER_SOURCES_UNAVAILABLE");
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
      })),
    ...(findings.data ?? []).flatMap((f) => {
      const parsed = storedFindingSchema.safeParse(f.payload);
      return parsed.success
        ? [
            {
              id: f.id,
              type: "research_finding" as const,
              title: parsed.data.title,
              allowReuse: true,
              usageStatus: "reference",
              usageCount: 0,
              reuseConfirmed: false,
            },
          ]
        : [];
    }),
  ];
}
