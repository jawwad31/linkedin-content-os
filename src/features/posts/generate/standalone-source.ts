import "server-only";

import { getContentBankEntry } from "@/features/content-bank/queries";
import { getContentBankPostEligibility } from "@/features/content-bank/post-eligibility";
import { CONTENT_BANK_CATEGORY_LABELS, type ContentBankEntry } from "@/features/content-bank/schemas";
import { createClient } from "@/lib/supabase/server";

import {
  standaloneContentBankSourceSchema,
  type StandaloneContentBankOption,
  type StandaloneDocumentOption,
} from "./standalone-brief-schema";

const TAKEAWAY_MAX = 700;

/** The wireframe prefills the form from the entry; only the takeaway can be taken from it as written. */
function suggestedTakeaway(entry: ContentBankEntry): string {
  const text = entry.sourceType === "content_resource"
    ? entry.problemSolved
    : entry.takeaway ?? entry.whatWasLearned;
  return (text ?? "").trim().slice(0, TAKEAWAY_MAX);
}

export function contentBankOption(entry: ContentBankEntry): StandaloneContentBankOption {
  const eligibility = getContentBankPostEligibility(entry);
  const details = entry.sourceType === "content_resource"
    ? [
        { label: "Resource type", value: entry.resourceType },
        { label: "Description", value: entry.description },
        { label: "Problem solved", value: entry.problemSolved },
        { label: "Target use case", value: entry.targetUseCase },
        { label: "Comment keyword", value: entry.keyword },
        { label: "Delivery URL", value: entry.deliveryUrl },
        { label: "Manual delivery instructions", value: entry.deliveryInstructions },
        { label: "Raw notes", value: entry.rawNotes },
      ]
    : [
        { label: entry.entryType === "trend_reaction" ? "Your take" : "Takeaway", value: entry.takeaway ?? entry.whatWasLearned },
        { label: "What happened / proof", value: entry.whatHappened },
        { label: "What changed", value: entry.whatChanged },
        { label: "Why it matters", value: entry.whyItMatters },
        { label: "Raw notes", value: entry.rawNotes },
      ];

  return {
    id: entry.id,
    sourceType: entry.sourceType,
    entryType: entry.entryType,
    title: entry.title,
    categoryLabel: CONTENT_BANK_CATEGORY_LABELS[entry.category],
    readiness: entry.readiness,
    usageStatus: entry.usageStatus,
    allowReuse: entry.allowReuse,
    eligible: eligibility.eligible,
    eligibilityMessage: eligibility.message,
    suggestedTakeaway: suggestedTakeaway(entry),
    canOffer: entry.sourceType === "content_resource" && Boolean(
      entry.active && entry.commentGateApproved && entry.keyword &&
      (entry.deliveryUrl || entry.deliveryInstructions),
    ),
    details: details.flatMap(({ label, value }) =>
      typeof value === "string" && value.trim()
        ? [{ label, value }]
        : []),
  };
}

export type StandaloneSources = {
  documents: StandaloneDocumentOption[];
  documentsUnavailable: boolean;
  initialContentBankSource: StandaloneContentBankOption | null;
  initialSourceError: string | null;
};

/** Saved source documents, plus the Content Bank entry named in the URL (if any), checked against this account. */
export async function loadStandaloneSources(
  clientId: string,
  query: Record<string, string | string[] | undefined>,
): Promise<StandaloneSources> {
  const [documentResult, selectedSource] = await Promise.all([
    (await createClient()).from("client_documents").select("id,filename,version")
      .eq("client_id", clientId).eq("purpose", "source_material")
      .eq("status", "ready").is("deleted_at", null)
      .order("created_at", { ascending: false }).returns<StandaloneDocumentOption[]>(),
    (async (): Promise<{ option: StandaloneContentBankOption } | { error: string } | null> => {
      const hasSelection = query.sourceId !== undefined || query.sourceType !== undefined;
      if (!hasSelection) return null;
      const parsed = standaloneContentBankSourceSchema.safeParse({
        mode: "content_bank",
        sourceId: typeof query.sourceId === "string" ? query.sourceId : "",
        sourceType: typeof query.sourceType === "string" ? query.sourceType : "",
      });
      if (!parsed.success) return { error: "This Content Bank selection is invalid. Return to Content Bank and choose the entry again." };
      const loaded = await getContentBankEntry(clientId, parsed.data.sourceId, parsed.data.sourceType);
      return loaded ? { option: contentBankOption(loaded.entry) }
        : { error: "This Content Bank entry is no longer available in this workspace." };
    })(),
  ]);
  return {
    documents: documentResult.data ?? [],
    documentsUnavailable: !!documentResult.error,
    initialContentBankSource: selectedSource && "option" in selectedSource ? selectedSource.option : null,
    initialSourceError: selectedSource && "error" in selectedSource ? selectedSource.error : null,
  };
}
