import { z } from "zod";
import { isPublicWebUrl } from "@/features/research/web-research/contracts";
import { articleToHtml, articleToPlainText, parseArticle } from "./article";
import { text, whole } from "./lenient";

export { articleToPlainText };

export const sourceSelectionSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum([
      "founder_experience",
      "content_resource",
      "research_finding",
    ]),
    reuseConfirmed: z.boolean(),
  })
  .strict();

const shortList = (max: number, itemMax: number) =>
  z.array(z.string().trim().max(itemMax)).max(max);

/**
 * One section of the outline. The planner fills the optional fields; the heading and
 * source ids are what the database enforces. `body` stays empty for editions written as a
 * single article and is only used by editions saved before the plan stage existed.
 */
export const sectionSchema = z
  .object({
    heading: z.string().trim().min(1).max(300),
    sourceIds: z.array(z.string().uuid()).min(1).max(8),
    commentary: z.string().trim().max(4000),
    body: z.string().trim().max(14000),
    sectionId: z.string().trim().max(24).optional(),
    readerQuestion: z.string().trim().max(800).optional(),
    purpose: z.string().trim().max(1000).optional(),
    keyPoints: shortList(12, 800).optional(),
    factIds: shortList(40, 16).optional(),
    interpretation: z.string().trim().max(1500).optional(),
    practicalTakeaway: z.string().trim().max(1500).optional(),
    transition: z.string().trim().max(800).optional(),
    targetWords: z.number().int().min(0).max(4000).optional(),
    riskFlags: shortList(10, 500).optional(),
  })
  .strict();

export const PLAN_STATUSES = [
  "ready",
  "needs_selection",
  "research_gap",
  "blocked",
] as const;
export const factSchema = z
  .object({
    factId: z.string().trim().min(1).max(16),
    claim: z.string().trim().min(1).max(1500),
    sourceIds: z.array(z.string().uuid()).min(1).max(8),
    evidenceExcerpt: z.string().trim().max(2500),
    evidenceType: z.enum([
      "first_party",
      "reported",
      "analysis",
      "estimate",
      "anecdote",
    ]),
    asOf: z.string().trim().max(40).nullable(),
    scopeAndQualifiers: z.string().trim().max(1200),
    confidence: z.enum(["high", "moderate", "low"]),
    writingPermission: z.enum(["allowed", "attributed_only", "omit"]),
  })
  .strict();
export const planSchema = z
  .object({
    status: z.enum(PLAN_STATUSES),
    statusNote: z.string().trim().max(4000).optional(),
    audience: z
      .object({
        description: z.string().trim().max(1500),
        jobToBeDone: z.string().trim().max(1500),
        readerProblem: z.string().trim().max(1500),
        technicalDepth: z.string().trim().max(40),
        intendedReaderTransformation: z.string().trim().max(1500),
      })
      .strict()
      .optional(),
    thesis: z.string().trim().max(1500).optional(),
    readerTransformation: z.string().trim().max(1500).optional(),
    whyNow: z.string().trim().max(1500).optional(),
    centralTension: z.string().trim().max(1500).optional(),
    issueFormat: z.string().trim().max(120).optional(),
    recommendedTitle: z.string().trim().max(300).optional(),
    titleOptions: shortList(5, 300).optional(),
    openingPromise: z.string().trim().max(1500).optional(),
    closingTakeaway: z.string().trim().max(1500).optional(),
    primaryCta: z.string().trim().max(1000).optional(),
    targetWordCount: z.number().int().min(100).max(6000).optional(),
    mustAttribute: shortList(60, 16).optional(),
    forbiddenUnverifiedClaims: shortList(30, 600).optional(),
    factLedger: z.array(factSchema).max(120).optional(),
    openQuestions: shortList(20, 800).optional(),
    researchGaps: shortList(20, 800).optional(),
    unusedSourceIds: z.array(z.string().uuid()).max(8).optional(),
  })
  .strict();
export type Plan = z.infer<typeof planSchema>;
export type PlanFact = z.infer<typeof factSchema>;

export const claimSchema = z
  .object({
    claimText: z.string().trim().max(1500),
    factIds: shortList(20, 16),
    sectionId: z.string().trim().max(24),
  })
  .strict();

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().startsWith(value)
    );
  });
export const editionInputSchema = z
  .object({
    title: z.string().trim().min(3).max(300),
    startDate: dateSchema,
    endDate: dateSchema,
    reader: z.string().trim().min(3).max(1000),
    depth: z.enum(["concise", "standard", "deep"]),
    sections: z.array(sectionSchema).min(1).max(8),
    plan: planSchema.optional(),
    article: z.string().max(60000).optional(),
    claims: z.array(claimSchema).max(500).optional(),
  })
  .strict()
  .refine((value) => value.endDate >= value.startDate, {
    message: "End date must follow start date.",
  });
export type EditionInput = z.infer<typeof editionInputSchema>;
export type SourceSelection = z.infer<typeof sourceSelectionSchema>;
export type NewsletterSource = {
  source_id: string;
  source_type: SourceSelection["type"];
  snapshot: Record<string, unknown>;
  content_hash: string;
  usage_id: string | null;
  usageHistory?: {
    id: string;
    source_id: string;
    status: string;
    channel: string;
    newsletter_id: string | null;
    post_id: string | null;
    created_at: string;
  }[];
};

/* ------------------------------------------------------------------ QA */

export const QA_SEVERITIES = ["critical", "major", "moderate", "minor"] as const;
export const QA_GATES = [
  "source_boundary",
  "numeric_and_date_integrity",
  "claim_to_evidence",
  "editorial_coherence",
  "publishing_integrity",
] as const;
const gateResult = z.enum(["pass", "fail"]);
/** What the model returns (snake_case, flat evidence). */
export const qaReportSchema = z
  .object({
    decision: z.enum(["pass", "revise", "replan", "blocked"]),
    hard_gates: z
      .object({
        source_boundary: gateResult,
        numeric_and_date_integrity: gateResult,
        claim_to_evidence: gateResult,
        editorial_coherence: gateResult,
        publishing_integrity: gateResult,
      })
      .strict(),
    score: z
      .object({
        evidence: whole(0, 30),
        reader_relevance: whole(0, 15),
        usefulness: whole(0, 15),
        structure: whole(0, 10),
        clarity_voice: whole(0, 10),
        headline_hook: whole(0, 10),
        citations: whole(0, 5),
        cta: whole(0, 5),
      })
      .strict(),
    issues: z
      .array(
        z
          .object({
            issue_id: text(16),
            severity: z.enum(QA_SEVERITIES),
            category: text(24),
            location: text(400),
            problem: text(1500),
            evidence_notes: text(1500),
            fact_ids: shortList(12, 16),
            required_fix: text(1500),
            route_to: z.enum(["writing", "planning"]),
          })
          .strict(),
      )
      .transform((items) => items.slice(0, 30)),
    claim_audit: z
      .object({
        checked_claim_count: whole(0, 1000000),
        supported_claim_count: whole(0, 1000000),
        unsupported_claim_count: whole(0, 1000000),
        unverified_claim_count: whole(0, 1000000),
        missing_citation_count: whole(0, 1000000),
      })
      .strict(),
    strengths_to_preserve: shortList(8, 600),
  })
  .strict();
export type QaReport = z.infer<typeof qaReportSchema>;

const storedIssueSchema = z
  .object({
    id: z.string().max(16),
    severity: z.enum(QA_SEVERITIES),
    category: z.string().max(24),
    location: z.string().max(400),
    problem: z.string().max(1500),
    evidence: z.string().max(1500),
    requiredFix: z.string().max(1500),
    routeTo: z.enum(["writing", "planning"]),
    origin: z.enum(["ai", "check"]),
  })
  .strict();
/** What is saved on a version. */
export const storedQaSchema = z
  .object({
    version: z.literal(2),
    decision: z.enum(["pass", "revise", "replan", "blocked"]),
    hardGates: z.record(z.string(), gateResult),
    score: z.number().int().min(0).max(100).nullable(),
    issues: z.array(storedIssueSchema).max(60),
    claimAudit: z
      .object({
        checked: z.number().int(),
        supported: z.number().int(),
        unsupported: z.number().int(),
        unverified: z.number().int(),
        missingCitation: z.number().int(),
      })
      .strict()
      .nullable(),
    strengths: shortList(8, 600),
  })
  .strict();
export type StoredQa = z.infer<typeof storedQaSchema>;
export type QaIssue = z.infer<typeof storedIssueSchema>;
export type NormalizedQa = {
  decision: StoredQa["decision"];
  issues: QaIssue[];
  gates: Record<string, "pass" | "fail">;
  score: number | null;
  strengths: string[];
  claimAudit: StoredQa["claimAudit"];
  legacy: boolean;
};

/** Reads both the current QA report and the older {verdict, issues[], proofNotes} shape. */
export function normalizeQa(raw: unknown): NormalizedQa | null {
  const current = storedQaSchema.safeParse(raw);
  if (current.success)
    return {
      decision: current.data.decision,
      issues: current.data.issues,
      gates: current.data.hardGates,
      score: current.data.score,
      strengths: current.data.strengths,
      claimAudit: current.data.claimAudit,
      legacy: false,
    };
  const legacy = z
    .object({
      verdict: z.enum(["pass", "needs_edit"]),
      issues: z.array(z.string()),
      proofNotes: z.string().optional(),
    })
    .safeParse(raw);
  if (!legacy.success) return null;
  return {
    decision: legacy.data.verdict === "pass" ? "pass" : "revise",
    issues: legacy.data.issues.map((problem, i) => ({
      id: `L${i + 1}`,
      severity: "moderate" as const,
      category: "legacy",
      location: "",
      problem,
      evidence: "",
      requiredFix: "",
      routeTo: "writing" as const,
      origin: "check" as const,
    })),
    gates: {},
    score: null,
    strengths: [],
    claimAudit: null,
    legacy: true,
  };
}

/** Converts the model's report into the stored shape, recomputing the total from the parts. */
export function toStoredQa(
  report: QaReport,
  checks: string[],
): StoredQa {
  const s = report.score;
  const total =
    s.evidence +
    s.reader_relevance +
    s.usefulness +
    s.structure +
    s.clarity_voice +
    s.headline_hook +
    s.citations +
    s.cta;
  const issues: QaIssue[] = [
    ...report.issues.map((i) => ({
      id: i.issue_id || "Q",
      severity: i.severity,
      category: i.category,
      location: i.location,
      problem: i.problem,
      evidence: [i.evidence_notes, i.fact_ids.join(", ")]
        .filter(Boolean)
        .join(" · "),
      requiredFix: i.required_fix,
      routeTo: i.route_to,
      origin: "ai" as const,
    })),
    ...checks.map((problem, i) => ({
      id: `C${i + 1}`,
      severity: "moderate" as const,
      category: "check",
      location: "",
      problem,
      evidence: "",
      requiredFix: "",
      routeTo: "writing" as const,
      origin: "check" as const,
    })),
  ];
  const failedGate = Object.values(report.hard_gates).includes("fail");
  // A failed hard gate or a critical issue can never read as a pass.
  const decision =
    report.decision === "pass" &&
    (failedGate || issues.some((i) => i.severity === "critical"))
      ? "revise"
      : report.decision;
  return {
    version: 2,
    decision,
    hardGates: report.hard_gates,
    score: total,
    issues,
    claimAudit: {
      checked: report.claim_audit.checked_claim_count,
      supported: report.claim_audit.supported_claim_count,
      unsupported: report.claim_audit.unsupported_claim_count,
      unverified: report.claim_audit.unverified_claim_count,
      missingCitation: report.claim_audit.missing_citation_count,
    },
    strengths: report.strengths_to_preserve,
  };
}

/** QA that could not run: never a pass, and says so. */
export function unavailableQa(checks: string[], reason: string): StoredQa {
  return {
    version: 2,
    decision: "revise",
    hardGates: {},
    score: null,
    issues: [
      {
        id: "U1",
        severity: "major",
        category: "check",
        location: "",
        problem: reason,
        evidence: "",
        requiredFix:
          "Check every fact, link and attribution against the sources before approving.",
        routeTo: "writing",
        origin: "check",
      },
      ...checks.map((problem, i) => ({
        id: `C${i + 1}`,
        severity: "moderate" as const,
        category: "check",
        location: "",
        problem,
        evidence: "",
        requiredFix: "",
        routeTo: "writing" as const,
        origin: "check" as const,
      })),
    ],
    claimAudit: null,
    strengths: [],
  };
}

/** A critical issue or a blocked decision cannot be approved; everything else is the human's call. */
export function qaBlocksApproval(qa: NormalizedQa | null): boolean {
  return (
    !qa || qa.decision === "blocked" || qa.issues.some((i) => i.severity === "critical")
  );
}

/* ------------------------------------------------------------- Editions */

export type Edition = {
  id: string;
  revision: number;
  status: "outline" | "review" | "approved" | "rejected" | "published";
  approved_revision: number | null;
  outline_revision: number | null;
  publication_url: string | null;
  published_on: string | null;
  created_at: string;
};
export type EditionVersion = {
  revision: number;
  payload: EditionInput;
  qa: unknown;
  evidence: Record<string, unknown> | null;
  created_at: string;
};
/** One line per edition in the list: its name and where it stands. */
export type EditionSummary = Edition & {
  name: string;
  planStatus: Plan["status"] | null;
  hasQa: boolean;
  qaDecision: StoredQa["decision"] | null;
  qaNotes: number;
};
export type SourceOption = SourceSelection & {
  title: string;
  allowReuse: boolean;
  usageStatus: string;
  usageCount: number;
  /** What the entry is: drives the group it is listed under and how the writer treats it. */
  kind: "experience" | "trend_reaction" | "resource" | "research";
};

/** Where an edition stands, and the one next step it needs. */
export type EditionStage =
  | "outline_needs_review"
  | "outline_blocked"
  | "outline_confirmed"
  | "draft_ready"
  | "edits_requested"
  | "approved"
  | "published";
export function editionStage(
  edition: Pick<Edition, "status" | "outline_revision" | "revision" | "approved_revision">,
  payload: Pick<EditionInput, "article" | "plan" | "sections"> | null,
): EditionStage {
  if (edition.status === "published") return "published";
  if (edition.status === "approved" && edition.approved_revision === edition.revision)
    return "approved";
  if (edition.status === "rejected") return "edits_requested";
  const written =
    !!payload?.article?.trim() || payload?.sections.every((s) => s.body.trim());
  if (written) return "draft_ready";
  if (payload?.plan && payload.plan.status !== "ready") return "outline_blocked";
  if (edition.outline_revision === edition.revision) return "outline_confirmed";
  return "outline_needs_review";
}

export function validateSourceArrangement(
  input: EditionInput,
  selections: SourceSelection[],
) {
  const selected = selections.map((s) => s.id);
  const arranged = new Set(input.sections.flatMap((s) => s.sourceIds));
  return (
    new Set(selected).size === selected.length &&
    arranged.size === selected.length &&
    [...arranged].every((id) => selected.includes(id)) &&
    input.sections.every(
      (s) => new Set(s.sourceIds).size === s.sourceIds.length,
    )
  );
}

/* --------------------------------------------------------------- Export */

/** Only visible edition text is exported. Private evidence and manifests stay inside the app. */
export function exportEdition(input: EditionInput) {
  if (input.article?.trim()) return articleToPlainText(input.article);
  return [
    input.title,
    ...input.sections.map((s) => `${s.heading}\n\n${s.body}`),
  ].join("\n\n");
}

/** The same edition as simple HTML for a rich paste into the LinkedIn editor. */
export function exportEditionHtml(input: EditionInput) {
  if (input.article?.trim()) return articleToHtml(input.article);
  return articleToHtml(
    [
      `# ${input.title}`,
      ...input.sections.map((s) => `## ${s.heading}\n\n${s.body}`),
    ].join("\n\n"),
  );
}

export function hasPrivateEvidenceLink(text: string) {
  return /https?:\/\/[^\s]*\/storage\/v1\/(?:object|render)|https?:\/\/[^\s]+[?&](?:token|signature|x-amz-signature)=|private_evidence/i.test(
    text,
  );
}

export function newsletterChecks(
  input: EditionInput,
  sources: NewsletterSource[],
): string[] {
  const issues: string[] = [];
  const text = exportEdition(input);
  const publicLinks = new Set(
    sources.flatMap((s) => {
      if (s.source_type === "content_resource") {
        const url = s.snapshot.deliveryUrl;
        return typeof url === "string" &&
          isPublicWebUrl(url) &&
          !hasPrivateEvidenceLink(url)
          ? [url]
          : [];
      }
      if (s.source_type !== "research_finding") return [];
      const links = s.snapshot.sources;
      return Array.isArray(links)
        ? links.flatMap((link) =>
            typeof link?.url === "string" ? [link.url] : [],
          )
        : [];
    }),
  );
  for (const url of text.match(/https?:\/\/[^\s)\]>]+/g) ?? []) {
    if (!isPublicWebUrl(url) || !publicLinks.has(url))
      issues.push("Check an unverified or private link before publication.");
  }
  const written = !!input.article?.trim();
  if (!written && input.sections.some((s) => !s.body.trim()))
    issues.push("One or more sections have no draft text.");
  if (!written && input.sections.some((s) => !s.commentary.trim()))
    issues.push(
      "Personal commentary is missing in one or more sections; do not invent it.",
    );
  const paragraphs = (
    written ? [input.article!] : input.sections.map((s) => s.body)
  )
    .flatMap((b) => b.split(/\n\s*\n/))
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 80);
  if (new Set(paragraphs).size !== paragraphs.length)
    issues.push("Repeated paragraphs need editing.");
  if (written) {
    const blocks = parseArticle(input.article!);
    if (!blocks.some((b) => b.kind === "heading"))
      issues.push("The edition has no headings; add some so it scans well.");
    if (blocks.some((b) => b.kind === "paragraph" && b.text.length > 1200))
      issues.push("A paragraph is very long; break it up for LinkedIn.");
    if (/^\s*\|.*\|\s*$/m.test(input.article!))
      issues.push("Tables do not paste into LinkedIn; use a list instead.");
  }
  if (hasPrivateEvidenceLink(text) || /sourceIds|\bF\d{2}\b|\bS0\d\b/.test(text))
    issues.push(
      "Check for private evidence links or internal labels in the copy.",
    );
  return [...new Set(issues)];
}
