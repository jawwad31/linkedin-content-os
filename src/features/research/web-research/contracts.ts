import { z } from "zod";

export const INITIAL_RESEARCH_PROMPT =
  "Deliver a concise, high-signal daily briefing for a digital marketing agency. Research the past week and cover only consequential changes or tactics: Meta and Google Ads platform/policy/measurement updates; GoHighLevel releases, best practices; Google Business Profile, local SEO, AI Overviews/local search, reviews and Maps; CRO and lead-conversion best practices; CRM, AI agents, AI Chatbots and calling agents, call/chat/SMS automation; and other material digital-marketing developments. For each item include what changed, why it matters for local-service clients, and a specific agency action. Prioritize primary sources and include direct source links. Clearly separate confirmed platform changes from informed trend analysis. Skip minor news and generic advice.";

/**
 * The most one research run may spend. These defaults can be lowered or raised with the optional
 * RESEARCH_* settings read by `researchBudget()`; the figure used is saved with each run.
 */
export const RESEARCH_BUDGET = {
  /** Web searches per run across all topic lanes: lanes x searchesPerLane at most. */
  maxToolCalls: 8,
  /** Longest answer one model step may write. */
  maxOutputTokens: 8000,
  /** Longest one model step may take. */
  timeoutMs: 90_000,
  maxInputBytes: 180_000,
  maxResponseBytes: 3_000_000,
  /** Topic lanes the saved prompt is split into, each searched separately. */
  maxLanes: 4,
  searchesPerLane: 2,
  /** Pages opened and read in full, from search results and RSS leads together. */
  maxPages: 14,
  maxRssLeadPages: 4,
  /** Characters of one page the evidence step reads. */
  pageTextChars: 12_000,
  pagesPerExtraction: 3,
  /** Times a model answer that is not valid JSON may be converted again, across the whole run. */
  maxRepairs: 3,
  /** The whole run stops starting new steps after this, so it finishes inside the request limit. */
  totalSeconds: 240,
} as const;

export type ResearchBudget = { [K in keyof typeof RESEARCH_BUDGET]: number };

const withinLimits = (name: string, fallback: number, min: number, max: number) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
};
/** The budget for this run: the defaults, optionally changed by RESEARCH_* server settings. */
export function researchBudget(): ResearchBudget {
  const lanes = withinLimits("RESEARCH_MAX_LANES", RESEARCH_BUDGET.maxLanes, 1, 6);
  const perLane = withinLimits("RESEARCH_SEARCHES_PER_LANE", RESEARCH_BUDGET.searchesPerLane, 1, 3);
  return {
    ...RESEARCH_BUDGET,
    maxLanes: lanes,
    searchesPerLane: perLane,
    maxToolCalls: lanes * perLane,
    maxPages: withinLimits("RESEARCH_MAX_PAGES", RESEARCH_BUDGET.maxPages, 4, 24),
    totalSeconds: withinLimits("RESEARCH_TOTAL_SECONDS", RESEARCH_BUDGET.totalSeconds, 60, 270),
  };
}
export const settingsSchema = z
  .object({
    prompt: z.string().min(10).max(12_000),
    lookbackDays: z.number().int().min(1).max(30),
    useProfileContext: z.boolean(),
  })
  .strict();
export type ResearchSettings = z.infer<typeof settingsSchema> & {
  revision: number;
};
export const saveSettingsSchema = settingsSchema.extend({
  expectedRevision: z.number().int().min(0),
});
export const runRequestSchema = z
  .object({
    expectedRevision: z.number().int().min(1),
    requestKey: z.string().uuid(),
  })
  .strict();

export function isPublicWebUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !/^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.|\[|172\.(1[6-9]|2\d|3[01])\.)/i.test(
        url.hostname,
      )
    );
  } catch {
    return false;
  }
}
const webUrl = z.string().url().refine(isPublicWebUrl);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().startsWith(value)
    );
  })
  .nullable();
export const evidenceSchema = z
  .object({
    url: webUrl,
    title: z.string().min(1).max(500),
    publishedOn: date,
    announcedOn: date,
    effectiveOn: date,
    dateEvidence: z.string().max(1200).nullable(),
    sourceKind: z.enum(["primary", "secondary", "unknown"]),
    /** A short quote from the page that supports the claim, checked against the page text. */
    excerpt: z.string().max(700).optional(),
  })
  .strict();
export const findingSchema = z
  .object({
    developmentKey: z.string().min(3).max(200),
    title: z.string().min(3).max(300),
    whatChanged: z.string().min(10).max(2000),
    whyItMatters: z.string().min(3).max(1500),
    agencyAction: z.string().min(3).max(1500),
    angle: z.string().min(3).max(700),
    /** What was true before the change, when the source says. */
    previousState: z.string().max(1000).optional(),
    /** Who is affected. */
    audience: z.string().max(600).optional(),
    /** What the sources do not show, or what is uncertain. */
    limitations: z.string().max(1200).optional(),
    category: z.enum(["confirmed_change", "trend_analysis"]),
    confidence: z.enum(["high", "medium", "low"]),
    consequence: z.number().int().min(1).max(5),
    relevance: z.number().int().min(1).max(5),
    novelty: z.enum(["new", "follow_up", "repeated"]),
    previousFindingId: z.string().uuid().nullable(),
    sources: z.array(evidenceSchema).min(1),
  })
  .strict();
export const briefingOutputSchema = z
  .object({
    summary: z.string().max(2000),
    coverageGaps: z.array(z.string().max(500)).max(12),
    findings: z.array(findingSchema).max(12),
  })
  .strict();
export type Evidence = z.infer<typeof evidenceSchema>;
export type Finding = z.infer<typeof findingSchema>;
// Grouping can join several bounded provider items. Preserve each fact rather
// than truncating the combined record back to a per-item provider limit.
export const storedFindingSchema = findingSchema.extend({
  whatChanged: z.string().min(10),
  whyItMatters: z.string().min(3),
  agencyAction: z.string().min(3),
  angle: z.string().min(3),
  fingerprint: z.string(),
});
export type Candidate = Evidence & { fetchedAt: string };
export type StoredFinding = Finding & {
  id: string;
  fingerprint: string;
  approval_status: "pending" | "approved" | "archived";
  content_idea_id: string | null;
  /** The Content Bank trend reaction saved from this finding, once there is one. */
  content_bank_entry_id: string | null;
};
export type ResearchOutcome =
  "success" | "empty" | "partial" | "failed" | "not_configured";
export type ResearchResult = {
  outcome: ResearchOutcome;
  summary: string;
  coverageGaps: string[];
  candidates: Candidate[];
  findings: (Finding & { fingerprint: string })[];
  errorCode: string | null;
  toolCalls: number;
  tokenInput: number | null;
  tokenOutput: number | null;
};
export type BriefingView = {
  id: string;
  revision: number;
  outcome: ResearchOutcome | "running";
  summary: string;
  coverage_gaps: string[];
  error_code: string | null;
  created_at: string;
  candidate_count: number;
  findings: StoredFinding[];
  candidates: Candidate[];
};
