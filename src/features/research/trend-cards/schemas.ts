import { z } from "zod";

export const FOUNDER_TAKE_MAX_LENGTH = 2000;

export const founderTakeInputSchema = z.object({
  founderTake: z
    .string()
    .trim()
    .max(
      FOUNDER_TAKE_MAX_LENGTH,
      `Founder Take must be ${FOUNDER_TAKE_MAX_LENGTH} characters or fewer.`,
    ),
});

export type FounderTakeInput = z.infer<typeof founderTakeInputSchema>;

export const REACTION_TYPES = [
  "agreement",
  "contradiction",
  "gap",
  "observation",
] as const;

export type ReactionType = (typeof REACTION_TYPES)[number];

export const REACTION_TYPE_LABELS: Record<ReactionType, string> = {
  agreement: "Agreement",
  contradiction: "Contradiction",
  gap: "Gap",
  observation: "Observation",
};

export const trendReactionInputSchema = z.object({
  reactionType: z.enum(REACTION_TYPES),
  take: z
    .string()
    .trim()
    .min(1, "Add your take before saving this reaction.")
    .max(2000, "Your take must be 2000 characters or fewer."),
  proofOrExample: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type TrendReactionInput = z.infer<typeof trendReactionInputSchema>;
