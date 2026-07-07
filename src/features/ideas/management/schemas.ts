import { z } from "zod";

export const FOUNDER_DIRECTION_MAX_LENGTH = 2000;

export const founderDirectionRequestSchema = z.object({
  founderDirection: z
    .string()
    .trim()
    .max(
      FOUNDER_DIRECTION_MAX_LENGTH,
      `Founder Direction must be ${FOUNDER_DIRECTION_MAX_LENGTH} characters or fewer.`,
    ),
});

export type FounderDirectionRequest = z.infer<
  typeof founderDirectionRequestSchema
>;
