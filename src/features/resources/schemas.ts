import { z } from "zod";

import { RESOURCE_TYPES } from "@/lib/ai/playbooks/taxonomies";

const optionalText = (max: number) =>
  z.string().trim().max(max).nullable().optional();

const optionalUrl = z
  .union([z.string().trim().url().max(2_000), z.literal(""), z.null()])
  .optional()
  .transform((value) => (value ? value : null));

export const contentResourceInputSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    resourceType: z.enum(RESOURCE_TYPES),
    description: optionalText(2_000),
    problemSolved: optionalText(1_500),
    targetUseCase: optionalText(1_500),
    keyword: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[A-Za-z0-9_-]+$/)
      .transform((value) => value.toUpperCase()),
    deliveryUrl: optionalUrl,
    deliveryInstructions: optionalText(2_000),
    active: z.boolean().default(true),
    commentGateApproved: z.boolean().default(false),
  })
  .strict()
  .refine(
    (value) =>
      Boolean(value.deliveryUrl) || Boolean(value.deliveryInstructions?.trim()),
    {
      message: "Add a delivery URL or delivery instructions.",
      path: ["deliveryUrl"],
    },
  );

export const contentResourceUpdateSchema = contentResourceInputSchema;

export type ContentResourceInput = z.infer<typeof contentResourceInputSchema>;
