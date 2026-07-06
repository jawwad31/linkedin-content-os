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
