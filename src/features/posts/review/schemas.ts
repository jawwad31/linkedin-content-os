import { z } from "zod";
import { FUNNEL_STAGES, POST_TYPES } from "@/lib/ai/playbooks/taxonomies";

export const EDIT_NOTE_MAX_LENGTH = 2000;

export const needsEditRequestSchema = z.object({
  editNote: z
    .string()
    .trim()
    .min(1, "Edit note is required.")
    .max(
      EDIT_NOTE_MAX_LENGTH,
      `Edit note must be ${EDIT_NOTE_MAX_LENGTH} characters or fewer.`,
    ),
});

export type NeedsEditRequest = z.infer<typeof needsEditRequestSchema>;

export const editPostContentSchema = z.object({
  finalPost: z.string().trim().min(1, "Post content cannot be empty.").max(10_000).optional(),
  postType: z.enum(POST_TYPES).optional(),
  funnelStage: z.enum(FUNNEL_STAGES).optional(),
  intendedReader: z.string().trim().max(500).optional(),
  primaryTakeaway: z.string().trim().max(1000).optional(),
  contentPillar: z.string().trim().max(500).optional(),
});

export type EditPostContentInput = z.infer<typeof editPostContentSchema>;
