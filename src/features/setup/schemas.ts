import { z } from "zod";

export const CLIENT_CONTEXT_COLUMNS = [
  "name",
  "founder_name",
  "industry",
  "business_description",
  "primary_icp",
  "audience_understanding",
  "pain_points",
  "main_offer",
  "commercial_details",
  "delivery_approach",
  "business_positioning",
  "questions_and_doubts",
  "banned_topics",
  "approved_proof",
  "role_and_work",
  "personal_positioning",
  "personal_readers",
  "content_pillars",
  "principles",
  "voice_guide",
  "founder_voice_sample",
  "founder_voice_examples",
  "phrases_to_use",
  "phrases_to_avoid",
  "boundaries",
  "business_mentions",
  "profile_revision",
] as const;

export type ClientContextColumn = (typeof CLIENT_CONTEXT_COLUMNS)[number];

const singleLine = (max: number) => z.string().trim().max(max);
const multiLine = (max: number) => z.string().trim().max(max);
const optionalUrl = z
  .string()
  .trim()
  .max(2_000)
  .refine(
    (value) => value.length === 0 || z.url().safeParse(value).success,
    "Use a valid URL.",
  );

export const founderVoiceExampleSchema = z.object({
  label: z.string().trim().min(1).max(120),
  text: z.string().trim().min(1).max(6_000),
  attributionUrl: z.string().url().max(2_000).nullable(),
});

export type FounderVoiceExample = z.infer<typeof founderVoiceExampleSchema>;

export const businessContextFormSchema = z
  .object({
    // Business profile
    name: singleLine(200).min(1, "Business name is required."),
    industry: singleLine(200).default(""),
    businessDescription: multiLine(4_000).default(""),
    primaryIcp: multiLine(2_000).default(""),
    audienceUnderstanding: multiLine(2_000).default(""),
    painPoints: multiLine(2_000).default(""),
    mainOffer: multiLine(2_000).default(""),
    commercialDetails: multiLine(2_000).default(""),
    deliveryApproach: multiLine(2_000).default(""),
    businessPositioning: multiLine(2_000).default(""),
    questionsAndDoubts: multiLine(2_000).default(""),
    bannedTopics: multiLine(2_000).default(""),
    approvedProof: multiLine(4_000).default(""),

    // Personal-brand profile
    founderName: singleLine(200).default(""),
    roleAndWork: multiLine(2_000).default(""),
    personalPositioning: multiLine(2_000).default(""),
    personalReaders: multiLine(2_000).default(""),
    contentPillars: multiLine(2_000).default(""),
    principles: multiLine(2_000).default(""),
    voiceGuide: multiLine(4_000).default(""),
    founderVoiceSample: multiLine(4_000).default(""),
    phrasesToUse: multiLine(2_000).default(""),
    phrasesToAvoid: multiLine(2_000).default(""),
    boundaries: multiLine(2_000).default(""),
    businessMentions: multiLine(2_000).default(""),

    // Inspiration voice examples
    voiceExample1Label: singleLine(120).default(""),
    voiceExample1Text: multiLine(6_000).default(""),
    voiceExample1Url: optionalUrl.default(""),
    voiceExample2Label: singleLine(120).default(""),
    voiceExample2Text: multiLine(6_000).default(""),
    voiceExample2Url: optionalUrl.default(""),
    voiceExample3Label: singleLine(120).default(""),
    voiceExample3Text: multiLine(6_000).default(""),
    voiceExample3Url: optionalUrl.default(""),
  })
  .superRefine((input, context) => {
    ([1, 2, 3] as const).forEach((index) => {
      const label = input[`voiceExample${index}Label`];
      const text = input[`voiceExample${index}Text`];
      const url = input[`voiceExample${index}Url`];
      const hasAny = Boolean(label || text || url);
      if (hasAny && !label) {
        context.addIssue({
          code: "custom",
          path: [`voiceExample${index}Label`],
          message: "Add a short label for this inspiration post.",
        });
      }
      if (hasAny && !text) {
        context.addIssue({
          code: "custom",
          path: [`voiceExample${index}Text`],
          message: "Paste the inspiration post text.",
        });
      }
    });
  });

export type BusinessContextFormInput = z.infer<typeof businessContextFormSchema>;

function emptyToNull(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function linesToArray(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function voiceExamplesFromInput(
  input: BusinessContextFormInput,
): FounderVoiceExample[] {
  return ([1, 2, 3] as const).flatMap((index) => {
    const label = input[`voiceExample${index}Label`];
    const text = input[`voiceExample${index}Text`];
    const attributionUrl = input[`voiceExample${index}Url`];
    if (!label || !text) return [];
    return [{ label, text, attributionUrl: attributionUrl || null }];
  });
}

export function toClientContextUpdate(
  input: BusinessContextFormInput,
  currentRevision: number = 1,
) {
  return {
    name: input.name,
    founder_name: emptyToNull(input.founderName),
    industry: emptyToNull(input.industry),
    business_description: emptyToNull(input.businessDescription),
    primary_icp: emptyToNull(input.primaryIcp),
    audience_understanding: emptyToNull(input.audienceUnderstanding),
    pain_points: emptyToNull(input.painPoints),
    main_offer: emptyToNull(input.mainOffer),
    commercial_details: emptyToNull(input.commercialDetails),
    delivery_approach: emptyToNull(input.deliveryApproach),
    business_positioning: emptyToNull(input.businessPositioning),
    questions_and_doubts: emptyToNull(input.questionsAndDoubts),
    banned_topics: linesToArray(input.bannedTopics),
    approved_proof: linesToArray(input.approvedProof),

    role_and_work: emptyToNull(input.roleAndWork),
    personal_positioning: emptyToNull(input.personalPositioning),
    personal_readers: emptyToNull(input.personalReaders),
    content_pillars: linesToArray(input.contentPillars),
    principles: emptyToNull(input.principles),
    voice_guide: emptyToNull(input.voiceGuide),
    founder_voice_sample: emptyToNull(input.founderVoiceSample),
    founder_voice_examples: voiceExamplesFromInput(input),
    phrases_to_use: linesToArray(input.phrasesToUse),
    phrases_to_avoid: linesToArray(input.phrasesToAvoid),
    boundaries: emptyToNull(input.boundaries),
    business_mentions: emptyToNull(input.businessMentions),

    profile_revision: currentRevision + 1,
  };
}
