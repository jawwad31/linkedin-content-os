import { z } from "zod";
import { isPublicWebUrl } from "@/features/research/web-research/contracts";

export const sourceSelectionSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum([
      "founder_experience",
      "content_resource",
      "research_finding",
    ]),
    reuseConfirmed: z.boolean(),
  })
  .strict();
export const sectionSchema = z
  .object({
    heading: z.string().trim().min(1).max(300),
    sourceIds: z.array(z.string().uuid()).min(1).max(8),
    commentary: z.string().trim().max(4000),
    body: z.string().trim().max(14000),
  })
  .strict();
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().startsWith(value)
    );
  });
export const editionInputSchema = z
  .object({
    title: z.string().trim().min(3).max(300),
    startDate: dateSchema,
    endDate: dateSchema,
    reader: z.string().trim().min(3).max(1000),
    depth: z.enum(["concise", "standard", "deep"]),
    sections: z.array(sectionSchema).min(1).max(8),
  })
  .strict()
  .refine((value) => value.endDate >= value.startDate, {
    message: "End date must follow start date.",
  });
export type EditionInput = z.infer<typeof editionInputSchema>;
export type SourceSelection = z.infer<typeof sourceSelectionSchema>;
export type NewsletterSource = {
  source_id: string;
  source_type: SourceSelection["type"];
  snapshot: Record<string, unknown>;
  content_hash: string;
  usage_id: string | null;
  usageHistory?: {
    id: string;
    source_id: string;
    status: string;
    channel: string;
    newsletter_id: string | null;
    post_id: string | null;
    created_at: string;
  }[];
};
export const qaSchema = z
  .object({
    verdict: z.enum(["pass", "needs_edit"]),
    issues: z.array(z.string().min(1).max(1000)).max(24),
    proofNotes: z.string().max(4000),
  })
  .strict();
export type NewsletterQa = z.infer<typeof qaSchema>;
export type Edition = {
  id: string;
  revision: number;
  status: "outline" | "review" | "approved" | "rejected" | "published";
  approved_revision: number | null;
  outline_revision: number | null;
  publication_url: string | null;
  published_on: string | null;
  created_at: string;
};
export type EditionVersion = {
  revision: number;
  payload: EditionInput;
  qa: NewsletterQa | null;
  evidence: Record<string, unknown> | null;
  created_at: string;
};
export type SourceOption = SourceSelection & {
  title: string;
  allowReuse: boolean;
  usageStatus: string;
  usageCount: number;
};

export function validateSourceArrangement(
  input: EditionInput,
  selections: SourceSelection[],
) {
  const selected = selections.map((s) => s.id);
  const arranged = input.sections.flatMap((s) => s.sourceIds);
  return (
    new Set(selected).size === selected.length &&
    new Set(arranged).size === arranged.length &&
    arranged.length === selected.length &&
    arranged.every((id) => selected.includes(id))
  );
}

/** Only visible edition text is exported. Private evidence and manifests stay inside the app. */
export function exportEdition(input: EditionInput) {
  return [
    input.title,
    ...input.sections.map((s) => `${s.heading}\n\n${s.body}`),
  ].join("\n\n");
}

export function hasPrivateEvidenceLink(text: string) {
  return /https?:\/\/[^\s]*\/storage\/v1\/(?:object|render)|https?:\/\/[^\s]+[?&](?:token|signature|x-amz-signature)=|private_evidence/i.test(
    text,
  );
}

export function newsletterChecks(
  input: EditionInput,
  sources: NewsletterSource[],
): string[] {
  const issues: string[] = [];
  const text = exportEdition(input);
  const publicLinks = new Set(
    sources
      .filter((s) => s.source_type === "research_finding")
      .flatMap((s) => {
        const links = s.snapshot.sources;
        return Array.isArray(links)
          ? links.flatMap((link) =>
              typeof link?.url === "string" ? [link.url] : [],
            )
          : [];
      }),
  );
  for (const url of text.match(/https?:\/\/[^\s)\]>]+/g) ?? []) {
    if (!isPublicWebUrl(url) || !publicLinks.has(url))
      issues.push("Check an unverified or private link before publication.");
  }
  if (input.sections.some((s) => !s.body.trim()))
    issues.push("One or more sections have no draft text.");
  if (input.sections.some((s) => !s.commentary.trim()))
    issues.push(
      "Personal commentary is missing in one or more sections; do not invent it.",
    );
  const paragraphs = input.sections
    .flatMap((s) => s.body.split(/\n\s*\n/))
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 80);
  if (new Set(paragraphs).size !== paragraphs.length)
    issues.push("Repeated paragraphs need editing.");
  if (hasPrivateEvidenceLink(text) || /sourceIds/i.test(text))
    issues.push(
      "Check for private evidence links or internal labels in the copy.",
    );
  return [...new Set(issues)];
}
