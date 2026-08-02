import { z } from "zod";

export const CLIENT_CONTEXT_COLUMNS = [
  "name",
  "founder_name",
  "industry",
  "business_description",
  "primary_icp",
  "main_offer",
  "banned_topics",
  "founder_voice_sample",
  "founder_voice_examples",
  "phrases_to_use",
  "phrases_to_avoid",
  "approved_proof",
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
    name: singleLine(200).min(1, "Business name is required."),
    founderName: singleLine(200),
    industry: singleLine(200),
    businessDescription: multiLine(4_000),
    primaryIcp: multiLine(2_000),
    mainOffer: multiLine(2_000),
    bannedTopics: multiLine(2_000),
    founderVoiceSample: multiLine(4_000),
    phrasesToUse: multiLine(2_000),
    phrasesToAvoid: multiLine(2_000),
    approvedProof: multiLine(4_000),
    voiceExample1Label: singleLine(120),
    voiceExample1Text: multiLine(6_000),
    voiceExample1Url: optionalUrl,
    voiceExample2Label: singleLine(120),
    voiceExample2Text: multiLine(6_000),
    voiceExample2Url: optionalUrl,
    voiceExample3Label: singleLine(120),
    voiceExample3Text: multiLine(6_000),
    voiceExample3Url: optionalUrl,
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

function emptyToNull(value: string): string | null {
  return value.length === 0 ? null : value;
}

function linesToArray(value: string): string[] {
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

export function toClientContextUpdate(input: BusinessContextFormInput) {
  return {
    name: input.name,
    founder_name: emptyToNull(input.founderName),
    industry: emptyToNull(input.industry),
    business_description: emptyToNull(input.businessDescription),
    primary_icp: emptyToNull(input.primaryIcp),
    main_offer: emptyToNull(input.mainOffer),
    banned_topics: linesToArray(input.bannedTopics),
    founder_voice_sample: emptyToNull(input.founderVoiceSample),
    founder_voice_examples: voiceExamplesFromInput(input),
    phrases_to_use: linesToArray(input.phrasesToUse),
    phrases_to_avoid: linesToArray(input.phrasesToAvoid),
    approved_proof: linesToArray(input.approvedProof),
  } satisfies Record<ClientContextColumn, unknown>;
}
