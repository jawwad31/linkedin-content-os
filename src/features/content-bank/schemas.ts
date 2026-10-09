import { z } from "zod";

import { REACTION_TYPES } from "@/features/research/trend-cards/schemas";

export const CONTENT_BANK_CATEGORIES = [
  "problem_solved",
  "case_study",
  "experiment",
  "lesson",
  "observation",
  "process",
  "achievement",
  "lead_magnet",
] as const;

export type ContentBankCategory = (typeof CONTENT_BANK_CATEGORIES)[number];

export const CONTENT_BANK_CATEGORY_LABELS: Record<ContentBankCategory, string> = {
  problem_solved: "Problem Solved",
  case_study: "Case Study / Client Win",
  experiment: "Experiment",
  lesson: "Lesson / Mistake",
  observation: "Original Observation",
  process: "Process / Walkthrough",
  achievement: "Achievement",
  lead_magnet: "Lead Magnet / Asset",
};

export const CONTENT_BANK_READINESS = ["draft", "ready", "archived"] as const;
export type ContentBankReadiness = (typeof CONTENT_BANK_READINESS)[number];

export const USAGE_STATUSES = ["unused", "reserved", "used", "published"] as const;
export type UsageStatus = (typeof USAGE_STATUSES)[number];

export const LEAD_MAGNET_TYPES = [
  "guide",
  "template",
  "checklist",
  "framework",
  "report",
  "worksheet",
  "tool",
  "other",
] as const;
export type LeadMagnetType = (typeof LEAD_MAGNET_TYPES)[number];

export const ATTACHMENT_PURPOSES = [
  "source_material",
  "private_evidence",
  "reader_download",
] as const;
export type AttachmentPurpose = (typeof ATTACHMENT_PURPOSES)[number];

export const contentBankEntrySchema = z.object({
  id: z.string().uuid(),
  clientId: z.string().uuid(),
  sourceType: z.enum(["founder_experience", "content_resource"]),
  entryType: z.enum(["work_log", "trend_reaction"]).optional(),
  sourceTrendCardId: z.string().uuid().nullable().optional(),
  reactionType: z.enum(REACTION_TYPES).nullable().optional(),
  category: z.enum(CONTENT_BANK_CATEGORIES),
  title: z.string().trim().min(1).max(200),
  rawNotes: z.string().nullable(),
  takeaway: z.string().nullable(),
  whatHappened: z.string().nullable(),
  whatWasLearned: z.string().nullable(),
  whatChanged: z.string().nullable(),
  whyItMatters: z.string().nullable(),

  // Resource specifics (for lead_magnet category)
  resourceType: z.enum(LEAD_MAGNET_TYPES).nullable(),
  description: z.string().nullable().optional(),
  problemSolved: z.string().nullable().optional(),
  targetUseCase: z.string().nullable().optional(),
  active: z.boolean().optional(),
  keyword: z.string().nullable(),
  deliveryUrl: z.string().url().nullable().or(z.literal("")),
  deliveryInstructions: z.string().nullable(),
  commentGateApproved: z.boolean().default(false),

  readiness: z.enum(CONTENT_BANK_READINESS).default("ready"),
  allowReuse: z.boolean().default(false),

  // Derived usage state
  usageStatus: z.enum(USAGE_STATUSES).default("unused"),
  usageCount: z.number().int().nonnegative().default(0),

  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ContentBankEntry = z.infer<typeof contentBankEntrySchema>;

const contentBankFieldsSchema = z.object({
  category: z.enum(CONTENT_BANK_CATEGORIES),
  title: z.string().trim().min(1, "Title is required.").max(200),
  rawNotes: z.string().trim().max(10_000).optional(),
  takeaway: z.string().trim().max(2_000).optional(),
  whatHappened: z.string().trim().max(4_000).optional(),
  whatWasLearned: z.string().trim().max(4_000).optional(),
  whatChanged: z.string().trim().max(4_000).optional(),
  whyItMatters: z.string().trim().max(4_000).optional(),

  // Resource fields (mandatory if category is lead_magnet)
  resourceType: z.enum(LEAD_MAGNET_TYPES).optional(),
  description: z.string().trim().max(2_000).optional(),
  problemSolved: z.string().trim().max(1_500).optional(),
  targetUseCase: z.string().trim().max(1_500).optional(),
  active: z.boolean().optional(),
  keyword: z.string().trim().max(40).optional(),
  deliveryUrl: z.string().trim().url().max(2_000).optional().or(z.literal("")),
  deliveryInstructions: z.string().trim().max(2_000).optional(),
  commentGateApproved: z.boolean().optional(),
  reactionType: z.enum(REACTION_TYPES).optional(),

  readiness: z.enum(CONTENT_BANK_READINESS).optional(),
  allowReuse: z.boolean().optional(),
}).strict();

export const createContentBankEntrySchema = contentBankFieldsSchema.extend({
  category: z.enum(CONTENT_BANK_CATEGORIES).default("observation"),
  readiness: z.enum(CONTENT_BANK_READINESS).default("ready"),
  allowReuse: z.boolean().default(false),
});

// Updates have no defaults: an omitted field must retain its stored value.
export const updateContentBankEntrySchema = contentBankFieldsSchema.partial().extend({
  expectedUpdatedAt: z.string().datetime({ offset: true }).optional(),
});

export type CreateContentBankEntryInput = z.input<typeof createContentBankEntrySchema>;
export type UpdateContentBankEntryInput = z.input<typeof updateContentBankEntrySchema>;

export const sourceUsageRecordSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string().uuid(),
  sourceId: z.string().uuid(),
  sourceType: z.enum(["founder_experience", "content_resource"]),
  channel: z.enum(["linkedin_post", "newsletter", "calendar_slot"]),
  status: z.enum(["reserved", "used", "published", "cancelled"]),
  contentIdeaId: z.string().uuid().nullable(),
  postId: z.string().uuid().nullable(),
  newsletterId: z.string().uuid().nullable().optional(),
  angle: z.string().nullable(),
  takeaway: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SourceUsageRecord = z.infer<typeof sourceUsageRecordSchema>;
