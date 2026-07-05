import { z } from "zod";

/**
 * DB columns this feature is allowed to read/update, shared between the
 * read query and the update action so both always select/diff the exact
 * same set. Every one of these exists on `clients` today (Feature 03) —
 * no migration needed for this PR.
 */
export const CLIENT_CONTEXT_COLUMNS = [
  "name",
  "founder_name",
  "industry",
  "business_description",
  "primary_icp",
  "main_offer",
  "core_pov",
  "content_pillars",
  "research_keywords",
  "banned_topics",
  "founder_voice_sample",
  "phrases_to_use",
  "phrases_to_avoid",
  "approved_proof",
  "reference_material",
  "publishing_preferences",
] as const;

export type ClientContextColumn = (typeof CLIENT_CONTEXT_COLUMNS)[number];

const singleLine = (max: number) => z.string().trim().max(max);
const multiLine = (max: number) => z.string().trim().max(max);

/**
 * Raw form input shape. List fields (content_pillars, research_keywords,
 * etc.) are submitted as newline-separated text from a Textarea, not as
 * repeated form fields or a tag-input widget.
 */
export const businessContextFormSchema = z.object({
  name: singleLine(200).min(1, "Business name is required."),
  founderName: singleLine(200),
  industry: singleLine(200),
  businessDescription: multiLine(4000),
  primaryIcp: multiLine(2000),
  mainOffer: multiLine(2000),
  corePov: multiLine(4000),
  contentPillars: multiLine(4000),
  researchKeywords: multiLine(2000),
  bannedTopics: multiLine(2000),
  founderVoiceSample: multiLine(4000),
  phrasesToUse: multiLine(2000),
  phrasesToAvoid: multiLine(2000),
  approvedProof: multiLine(4000),
  referenceMaterial: multiLine(4000),
  publishingPreferencesNotes: multiLine(2000),
});

export type BusinessContextFormInput = z.infer<typeof businessContextFormSchema>;

function emptyToNull(value: string): string | null {
  return value.length === 0 ? null : value;
}

function linesToArray(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Maps validated form input to the exact `clients` columns this feature is
 * allowed to write. Never includes fields outside CLIENT_CONTEXT_COLUMNS.
 */
export function toClientContextUpdate(input: BusinessContextFormInput) {
  return {
    name: input.name,
    founder_name: emptyToNull(input.founderName),
    industry: emptyToNull(input.industry),
    business_description: emptyToNull(input.businessDescription),
    primary_icp: emptyToNull(input.primaryIcp),
    main_offer: emptyToNull(input.mainOffer),
    core_pov: emptyToNull(input.corePov),
    content_pillars: linesToArray(input.contentPillars),
    research_keywords: linesToArray(input.researchKeywords),
    banned_topics: linesToArray(input.bannedTopics),
    founder_voice_sample: emptyToNull(input.founderVoiceSample),
    phrases_to_use: linesToArray(input.phrasesToUse),
    phrases_to_avoid: linesToArray(input.phrasesToAvoid),
    approved_proof: linesToArray(input.approvedProof),
    reference_material: linesToArray(input.referenceMaterial),
    publishing_preferences:
      input.publishingPreferencesNotes.length > 0
        ? { notes: input.publishingPreferencesNotes }
        : {},
  } satisfies Record<ClientContextColumn, unknown>;
}
