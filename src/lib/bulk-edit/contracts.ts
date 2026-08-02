import { z } from "zod";

export const BATCH_EDIT_MAX_ITEMS = 100;

export const articleBatchStatusSchema = z.enum(["relevant", "irrelevant"]);
export type ArticleBatchStatus = z.infer<typeof articleBatchStatusSchema>;

export const batchArticleStatusRequestSchema = z
  .object({
    ids: z
      .array(z.string().uuid())
      .min(1)
      .max(BATCH_EDIT_MAX_ITEMS)
      .transform((ids) => Array.from(new Set(ids))),
    targetStatus: articleBatchStatusSchema,
  })
  .strict();

export const batchEditFailureSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1),
  message: z.string().min(1),
});
export type BatchEditFailure = z.infer<typeof batchEditFailureSchema>;

export const batchArticleStatusResultSchema = z.object({
  requestedCount: z.number().int().nonnegative(),
  updatedIds: z.array(z.string().uuid()),
  failures: z.array(batchEditFailureSchema),
});
export type BatchArticleStatusResult = z.infer<
  typeof batchArticleStatusResultSchema
>;
