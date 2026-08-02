import { z } from "zod";

export const BATCH_DELETE_MAX_ITEMS = 100;

export const BATCH_DELETE_ENTITY_TYPES = [
  "collected_article",
  "trend_card",
  "content_idea",
  "post",
] as const;

export const batchDeleteEntityTypeSchema = z.enum(
  BATCH_DELETE_ENTITY_TYPES,
);

export type BatchDeleteEntityType = z.infer<
  typeof batchDeleteEntityTypeSchema
>;

export const batchDeleteRequestSchema = z
  .object({
    entityType: batchDeleteEntityTypeSchema,
    ids: z
      .array(z.string().uuid())
      .min(1)
      .max(BATCH_DELETE_MAX_ITEMS)
      .transform((ids) => Array.from(new Set(ids))),
    confirmDelete: z.literal("DELETE"),
  })
  .strict();

export type BatchDeleteRequest = z.infer<typeof batchDeleteRequestSchema>;

export const batchDeleteFailureSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1),
  message: z.string().min(1),
});

export type BatchDeleteFailure = z.infer<typeof batchDeleteFailureSchema>;

export const batchDeleteResultSchema = z.object({
  requestedCount: z.number().int().nonnegative(),
  deletedIds: z.array(z.string().uuid()),
  failures: z.array(batchDeleteFailureSchema),
});

export type BatchDeleteResult = z.infer<typeof batchDeleteResultSchema>;
