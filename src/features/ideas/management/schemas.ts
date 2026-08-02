import { z } from "zod";

import {
  ANGLE_TYPES,
  CTA_TYPES,
  POST_STRUCTURES,
} from "@/lib/ai/playbooks/taxonomies";

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

export const strategyOverridesRequestSchema = z
  .object({
    angleType: z.enum(ANGLE_TYPES).nullable().optional(),
    postStructure: z.enum(POST_STRUCTURES).nullable().optional(),
    ctaType: z.enum(CTA_TYPES).nullable().optional(),
    resourceId: z.string().uuid().nullable().optional(),
  })
  .strict();

export type StrategyOverridesRequest = z.infer<
  typeof strategyOverridesRequestSchema
>;
