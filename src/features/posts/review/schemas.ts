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

const draftVersionSchema = z.number().int().min(1).max(2_147_483_647);

/** Approval names the exact version the reviewer read. */
export const approvePostRequestSchema = z.object({ version: draftVersionSchema }).strict();

/** Rejecting asks for a one-line note, kept with the post. */
export const rejectPostRequestSchema = z
  .object({
    note: z
      .string()
      .trim()
      .min(1, "Add a short note explaining the rejection.")
      .max(EDIT_NOTE_MAX_LENGTH, `Note must be ${EDIT_NOTE_MAX_LENGTH} characters or fewer.`),
  })
  .strict();

/** An edit names the version being edited, so a stale editor cannot overwrite a newer one. */
export const editPostRequestSchema = editPostContentSchema.extend({
  expectedVersion: draftVersionSchema,
});

export type EditPostRequest = z.infer<typeof editPostRequestSchema>;

const LINKEDIN_HOSTS = ["linkedin.com", "lnkd.in"];

/** Manual publication: the day it went out, and optionally where. */
export const markPublishedRequestSchema = z
  .object({
    publishedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date it was published."),
    linkedinUrl: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .transform((value) => (value ? value : undefined))
      .refine((value) => {
        if (!value) return true;
        try {
          const url = new URL(value);
          return (
            url.protocol === "https:" &&
            LINKEDIN_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
          );
        } catch {
          return false;
        }
      }, "Paste the LinkedIn post link (https://www.linkedin.com/...)."),
  })
  .strict();

export type MarkPublishedRequest = z.infer<typeof markPublishedRequestSchema>;
