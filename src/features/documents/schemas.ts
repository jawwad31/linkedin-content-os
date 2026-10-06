import { z } from "zod";

export const DOCUMENT_PURPOSES = [
  "source_material",
  "private_evidence",
  "reader_download",
  "profile_reference",
] as const;

export type DocumentPurpose = (typeof DOCUMENT_PURPOSES)[number];

export const DOCUMENT_PURPOSE_LABELS: Record<DocumentPurpose, string> = {
  source_material: "Source Material (Planning & Angle Ideas)",
  private_evidence: "Private Evidence (Proof & Verification Only)",
  reader_download: "Reader Download (Lead Magnet Asset)",
  profile_reference: "Profile Reference (Background & Beliefs)",
};

export const DOCUMENT_STATUSES = [
  "pending",
  "processing",
  "ready",
  "failed",
  "archived",
] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const clientDocumentSchema = z.object({
  id: z.string().uuid(),
  clientId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  fileSizeBytes: z.number().int().nonnegative(),
  mimeType: z.string().default("text/markdown"),
  purpose: z.enum(DOCUMENT_PURPOSES),
  version: z.number().int().positive().default(1),
  status: z.enum(DOCUMENT_STATUSES).default("ready"),
  contentText: z.string(),
  contentHash: z.string().length(64),
  errorMessage: z.string().nullable(),
  storagePath: z.string().nullable(),
  linkedSourceId: z.string().uuid().nullable(),
  linkedSourceType: z
    .enum(["founder_experience", "content_resource", "client_profile"])
    .nullable(),
  vectorStoreFileId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type ClientDocument = z.infer<typeof clientDocumentSchema>;

export const uploadDocumentSchema = z.object({
  filename: z
    .string()
    .trim()
    .min(1, "Filename is required.")
    .max(255)
    .refine(
      (name) => name.endsWith(".md") || name.endsWith(".txt"),
      "Only .md and .txt files are supported.",
    ),
  contentText: z
    .string()
    .min(1, "Document content cannot be empty.")
    .max(2_000_000, "Document exceeds maximum size limit (2 MB)."),
  purpose: z.enum(DOCUMENT_PURPOSES).default("source_material"),
  linkedSourceId: z.string().uuid().optional(),
  linkedSourceType: z
    .enum(["founder_experience", "content_resource", "client_profile"])
    .optional(),
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;

export const retrievedExcerptSchema = z.object({
  documentId: z.string().uuid(),
  filename: z.string(),
  contentHash: z.string(),
  purpose: z.enum(DOCUMENT_PURPOSES),
  sectionTitle: z.string().nullable(),
  excerpt: z.string(),
  score: z.number().optional(),
});

export type RetrievedExcerpt = z.infer<typeof retrievedExcerptSchema>;

export const contextManifestSchema = z.object({
  profileRevision: z.number().int().nonnegative(),
  sourceIds: z.array(
    z.object({
      id: z.string().uuid(),
      type: z.string(),
      version: z.number().optional(),
    }),
  ),
  playbookVersion: z.string(),
  retrievedSections: z.array(retrievedExcerptSchema),
  tokenEstimate: z.number().int().nonnegative(),
  createdAt: z.string(),
});

export type ContextManifest = z.infer<typeof contextManifestSchema>;
