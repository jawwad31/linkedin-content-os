import "server-only";
import { z } from "zod";
import { loadStagePlaybook } from "@/lib/ai/playbooks/loader";
import {
  getOpenRouterConfig,
  requestStructuredCompletion,
} from "@/lib/openrouter/client";
import type { ContentAgentBusinessContext } from "@/features/posts/agents/content-agent";
import type { RetrievedExcerpt } from "@/features/documents/schemas";
import { isPublicWebUrl } from "@/features/research/web-research/contracts";
import { list, text, whole } from "./lenient";
import {
  PLAN_STATUSES,
  newsletterChecks,
  qaReportSchema,
  toStoredQa,
  unavailableQa,
  type EditionInput,
  type NewsletterSource,
  type Plan,
  type PlanFact,
  type StoredQa,
} from "./contracts";

export type NewsletterAgentInput = {
  clientId: string;
  userId: string;
  payload: EditionInput;
  sources: NewsletterSource[];
  profile: ContentAgentBusinessContext;
  excerpts: RetrievedExcerpt[];
  /** Today's date, so the model can age dated sources. Injected so tests are stable. */
  today?: string;
};
export type StageResult =
  | { ok: true; payload: EditionInput }
  | { ok: false; message: string };

const PROMPT_BYTE_LIMIT = 180000;
const TARGET_WORDS = { concise: 700, standard: 1100, deep: 1600 } as const;
const NOT_CONFIGURED =
  "The AI is not configured, so nothing was written. Nothing was used up; try again once it is set up.";
const TOO_LARGE =
  "The selected material is too large for one edition. Choose fewer or shorter sources.";

/* ------------------------------------------------------- source aliases */

type SourceKind = "author_experience" | "trend_reaction" | "resource" | "research_finding";
function sourceKind(s: NewsletterSource): SourceKind {
  if (s.source_type === "content_resource") return "resource";
  if (s.source_type === "research_finding") return "research_finding";
  return s.snapshot.entryType === "trend_reaction"
    ? "trend_reaction"
    : "author_experience";
}
/** S01, S02, ... in a stable order, so the same sources get the same names in every stage. */
export function aliasSources(sources: NewsletterSource[]) {
  const ordered = [...sources].sort((a, b) =>
    a.source_id.localeCompare(b.source_id),
  );
  const toAlias = new Map<string, string>();
  const toId = new Map<string, string>();
  ordered.forEach((s, i) => {
    const alias = `S${String(i + 1).padStart(2, "0")}`;
    toAlias.set(s.source_id, alias);
    toId.set(alias, s.source_id);
  });
  return { ordered, toAlias, toId };
}
function firstPublicUrl(s: NewsletterSource): string | null {
  const links = s.snapshot.sources;
  if (Array.isArray(links)) {
    for (const link of links)
      if (typeof link?.url === "string" && isPublicWebUrl(link.url))
        return link.url;
  }
  const delivery = s.snapshot.deliveryUrl;
  return typeof delivery === "string" && isPublicWebUrl(delivery)
    ? delivery
    : null;
}
function selectedSources(sources: NewsletterSource[]) {
  const { ordered, toAlias } = aliasSources(sources);
  return ordered.map((s) => {
    const { fingerprint: _fingerprint, ...facts } = s.snapshot;
    void _fingerprint;
    return {
      source_id: toAlias.get(s.source_id),
      selected_by_user: true,
      source_kind: sourceKind(s),
      title: String(s.snapshot.title ?? "Selected source"),
      url: firstPublicUrl(s),
      text: JSON.stringify(facts),
    };
  });
}
function editionRequest(input: NewsletterAgentInput) {
  const p = input.payload;
  return {
    topic: p.title,
    reader_segment: p.reader,
    goal: "Interpret the selected material for this reader and say what to do about it",
    channel: "linkedin_native_newsletter",
    target_word_count: p.plan?.targetWordCount ?? TARGET_WORDS[p.depth],
    depth: p.depth,
    period_covered: { from: p.startDate, to: p.endDate },
    publication_date: input.today ?? new Date().toISOString().slice(0, 10),
    known_no_go_claims: input.profile.bannedTopics ?? [],
  };
}

/* ------------------------------------------------------------ plan stage */

const planOutputSchema = z
  .object({
    status: z.enum(PLAN_STATUSES),
    status_note: text(4000),
    audience: z
      .object({
        description: text(1500),
        job_to_be_done: text(1500),
        reader_problem: text(1500),
        technical_depth: text(40),
        intended_reader_transformation: text(1500),
      })
      .strict(),
    editorial_angle: z
      .object({
        thesis: text(1500),
        reader_transformation: text(1500),
        why_now: text(1500),
        central_tension: text(1500),
      })
      .strict(),
    issue_format: text(120),
    recommended_title: text(300),
    title_options: list(text(300), 5),
    opening_promise: text(1500),
    allowed_fact_ledger: z
      .array(
        z
          .object({
            fact_id: text(16),
            claim: text(1500),
            source_ids: list(text(8), 8),
            evidence_excerpt: text(2500),
            evidence_type: z.enum([
              "first_party",
              "reported",
              "analysis",
              "estimate",
              "anecdote",
            ]),
            as_of: text(40).nullable(),
            scope_and_qualifiers: text(1200),
            confidence: z.enum(["high", "moderate", "low"]),
            writing_permission: z.enum(["allowed", "attributed_only", "omit"]),
          })
          .strict(),
      )
      .transform((items) => items.slice(0, 120)),
    outline: z
      .array(
        z
          .object({
            section_id: text(24),
            working_heading: text(300),
            reader_question: text(800),
            section_purpose: text(1000),
            key_points: list(text(800), 12),
            fact_ids: list(text(16), 40),
            interpretation: text(1500),
            practical_takeaway: text(1500),
            transition: text(800),
            target_words: whole(0, 4000),
            risk_flags: list(text(500), 10),
          })
          .strict(),
      )
      .transform((items) => items.slice(0, 8)),
    closing_plan: z
      .object({ takeaway: text(1500), primary_cta: text(1000) })
      .strict(),
    writing_constraints: z
      .object({
        target_word_count: whole(100, 6000),
        must_attribute: list(text(16), 60),
        forbidden_unverified_claims: list(text(600), 30),
      })
      .strict(),
    open_questions: list(text(800), 20),
    research_gaps: list(text(800), 20),
  })
  .strict();
const str = { type: "string" } as const;
const strs = { type: "array", items: str } as const;
const int = { type: "integer" } as const;
function obj(properties: Record<string, unknown>) {
  return {
    type: "object",
    properties,
    required: Object.keys(properties),
    additionalProperties: false,
  } as const;
}
const planOutputJson = obj({
  status: { type: "string", enum: [...PLAN_STATUSES] },
  status_note: str,
  audience: obj({
    description: str,
    job_to_be_done: str,
    reader_problem: str,
    technical_depth: str,
    intended_reader_transformation: str,
  }),
  editorial_angle: obj({
    thesis: str,
    reader_transformation: str,
    why_now: str,
    central_tension: str,
  }),
  issue_format: str,
  recommended_title: str,
  title_options: strs,
  opening_promise: str,
  allowed_fact_ledger: {
    type: "array",
    items: obj({
      fact_id: str,
      claim: str,
      source_ids: strs,
      evidence_excerpt: str,
      evidence_type: {
        type: "string",
        enum: ["first_party", "reported", "analysis", "estimate", "anecdote"],
      },
      as_of: { type: ["string", "null"] },
      scope_and_qualifiers: str,
      confidence: { type: "string", enum: ["high", "moderate", "low"] },
      writing_permission: {
        type: "string",
        enum: ["allowed", "attributed_only", "omit"],
      },
    }),
  },
  outline: {
    type: "array",
    items: obj({
      section_id: str,
      working_heading: str,
      reader_question: str,
      section_purpose: str,
      key_points: strs,
      fact_ids: strs,
      interpretation: str,
      practical_takeaway: str,
      transition: str,
      target_words: int,
      risk_flags: strs,
    }),
  },
  closing_plan: obj({ takeaway: str, primary_cta: str }),
  writing_constraints: obj({
    target_word_count: int,
    must_attribute: strs,
    forbidden_unverified_claims: strs,
  }),
  open_questions: strs,
  research_gaps: strs,
});

export async function newsletterPrompt(
  input: NewsletterAgentInput,
  stage: "plan" | "write" | "qa",
  extra: Record<string, unknown> = {},
) {
  const playbook = await loadStagePlaybook(`newsletter-${stage}`);
  const task = {
    plan: "Task: plan this edition. Follow the planning skill exactly and return only the JSON the schema asks for. Use the aliases S01, S02 for sources and F01, F02 for facts.",
    write:
      "Task: write the edition from the approved plan. Follow the writing skill exactly and return only the JSON the schema asks for.",
    qa: "Task: review the edition independently. Follow the QA skill exactly and return only the JSON the schema asks for. Do not rewrite the edition.",
  }[stage];
  return {
    system: `${playbook}\n\n${task}`,
    user: JSON.stringify({
      edition_request: editionRequest(input),
      selected_sources: selectedSources(input.sources),
      profile: input.profile,
      supportingExcerpts: input.excerpts,
      ...extra,
    }),
  };
}

/** The plan as the writer and QA stages read it, with source aliases instead of ids. */
function planForPrompt(input: NewsletterAgentInput) {
  const { toAlias } = aliasSources(input.sources);
  const plan = input.payload.plan;
  const alias = (ids: string[]) =>
    ids.map((id) => toAlias.get(id)).filter((a): a is string => !!a);
  return {
    status: plan?.status,
    audience: plan?.audience,
    editorial_angle: {
      thesis: plan?.thesis,
      reader_transformation: plan?.readerTransformation,
      why_now: plan?.whyNow,
      central_tension: plan?.centralTension,
    },
    issue_format: plan?.issueFormat,
    recommended_title: plan?.recommendedTitle,
    opening_strategy: { opening_promise: plan?.openingPromise },
    allowed_fact_ledger: (plan?.factLedger ?? []).map((f) => ({
      fact_id: f.factId,
      claim: f.claim,
      source_ids: alias(f.sourceIds),
      evidence_excerpt: f.evidenceExcerpt,
      evidence_type: f.evidenceType,
      as_of: f.asOf,
      scope_and_qualifiers: f.scopeAndQualifiers,
      confidence: f.confidence,
      writing_permission: f.writingPermission,
    })),
    outline: input.payload.sections.map((s, i) => ({
      section_id: s.sectionId ?? `SEC${String(i + 1).padStart(2, "0")}`,
      working_heading: s.heading,
      reader_question: s.readerQuestion,
      section_purpose: s.purpose,
      key_points: s.keyPoints,
      fact_ids: s.factIds,
      interpretation: s.interpretation,
      practical_takeaway: s.practicalTakeaway,
      transition: s.transition,
      target_words: s.targetWords,
      risk_flags: s.riskFlags,
    })),
    closing_plan: { takeaway: plan?.closingTakeaway, primary_cta: plan?.primaryCta },
    writing_constraints: {
      target_word_count: plan?.targetWordCount,
      must_attribute: plan?.mustAttribute,
      forbidden_unverified_claims: plan?.forbiddenUnverifiedClaims,
    },
    open_questions: plan?.openQuestions,
  };
}

/**
 * Proposes the outline. On "ready" the sections replace the placeholder ones; otherwise the
 * sections stay as they were and the plan records why the material is not enough.
 */
export async function planNewsletter(
  input: NewsletterAgentInput,
): Promise<StageResult> {
  const config = getOpenRouterConfig("LLM_NEWSLETTER_PLAN_MODEL");
  if (!config) return { ok: false, message: NOT_CONFIGURED };
  const prompt = await newsletterPrompt(input, "plan");
  if (Buffer.byteLength(prompt.user) > PROMPT_BYTE_LIMIT)
    return { ok: false, message: TOO_LARGE };
  const result = await requestStructuredCompletion(
    config,
    [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    planOutputSchema,
    planOutputJson,
    "newsletter-plan",
    { timeoutMs: 120000, maxTokens: 12000, temperature: 0.3 },
    input.clientId,
    input.userId,
    "newsletter_plan",
  );
  if (!result.ok)
    return {
      ok: false,
      message:
        "The outline could not be produced. Nothing was used up; try again.",
    };
  return { ok: true, payload: applyPlan(input, result.data) };
}

/** Maps the model's aliases back to real ids and keeps only what the outline can stand on. */
export function applyPlan(
  input: NewsletterAgentInput,
  out: z.infer<typeof planOutputSchema>,
): EditionInput {
  const { toId } = aliasSources(input.sources);
  const allIds = [...toId.values()];
  const ledger: PlanFact[] = [];
  const seen = new Set<string>();
  for (const f of out.allowed_fact_ledger) {
    const sourceIds = [
      ...new Set(
        f.source_ids.map((a) => toId.get(a)).filter((x): x is string => !!x),
      ),
    ];
    if (!sourceIds.length || seen.has(f.fact_id) || !f.claim.trim()) continue;
    seen.add(f.fact_id);
    ledger.push({
      factId: f.fact_id,
      claim: f.claim,
      sourceIds,
      evidenceExcerpt: f.evidence_excerpt,
      evidenceType: f.evidence_type,
      asOf: f.as_of,
      scopeAndQualifiers: f.scope_and_qualifiers,
      confidence: f.confidence,
      writingPermission: f.writing_permission,
    });
  }
  const notReady = (note: string): EditionInput => ({
    ...input.payload,
    article: undefined,
    claims: undefined,
    plan: {
      status: out.status === "ready" ? "research_gap" : out.status,
      statusNote: note,
      openQuestions: out.open_questions,
      researchGaps: out.research_gaps,
    },
  });
  if (out.status !== "ready")
    return notReady(
      out.status_note ||
        "The selected sources are not enough for an honest edition.",
    );
  const usable = out.outline.filter((s) => s.working_heading.trim());
  if (!usable.length || !ledger.length)
    return notReady(
      "The outline came back without usable sections or facts. Choose sources with more substance, or regenerate the outline.",
    );
  const byFact = new Map(ledger.map((f) => [f.factId, f]));
  let previous: string[] = ledger[0].sourceIds;
  const sections = usable.map((s, i) => {
    const factIds = s.fact_ids.filter((id) => byFact.has(id));
    const ids = [
      ...new Set(factIds.flatMap((id) => byFact.get(id)!.sourceIds)),
    ].slice(0, 8);
    const sourceIds = ids.length ? ids : previous;
    previous = sourceIds;
    return {
      heading: s.working_heading.trim().slice(0, 300),
      sourceIds,
      commentary: "",
      body: "",
      sectionId: s.section_id.trim() || `SEC${String(i + 1).padStart(2, "0")}`,
      readerQuestion: s.reader_question,
      purpose: s.section_purpose,
      keyPoints: s.key_points,
      factIds,
      interpretation: s.interpretation,
      practicalTakeaway: s.practical_takeaway,
      transition: s.transition,
      targetWords: s.target_words,
      riskFlags: s.risk_flags,
    };
  });
  // Every selected source has to sit in at least one section. Whatever the planner left out
  // is attached to the last section and flagged, so the human can see it was not used.
  const covered = new Set(sections.flatMap((s) => s.sourceIds));
  const unused = allIds.filter((id) => !covered.has(id));
  if (unused.length) {
    const last = sections[sections.length - 1];
    last.sourceIds = [...last.sourceIds, ...unused].slice(0, 8);
  }
  const plan: Plan = {
    status: "ready",
    statusNote: out.status_note || undefined,
    audience: {
      description: out.audience.description,
      jobToBeDone: out.audience.job_to_be_done,
      readerProblem: out.audience.reader_problem,
      technicalDepth: out.audience.technical_depth,
      intendedReaderTransformation: out.audience.intended_reader_transformation,
    },
    thesis: out.editorial_angle.thesis,
    readerTransformation: out.editorial_angle.reader_transformation,
    whyNow: out.editorial_angle.why_now,
    centralTension: out.editorial_angle.central_tension,
    issueFormat: out.issue_format,
    recommendedTitle: out.recommended_title,
    titleOptions: out.title_options,
    openingPromise: out.opening_promise,
    closingTakeaway: out.closing_plan.takeaway,
    primaryCta: out.closing_plan.primary_cta,
    targetWordCount: out.writing_constraints.target_word_count,
    mustAttribute: out.writing_constraints.must_attribute,
    forbiddenUnverifiedClaims: out.writing_constraints.forbidden_unverified_claims,
    factLedger: ledger,
    openQuestions: out.open_questions,
    researchGaps: out.research_gaps,
    unusedSourceIds: unused,
  };
  return { ...input.payload, article: undefined, claims: undefined, sections, plan };
}

/* ----------------------------------------------------------- write stage */

const writerOutputSchema = z
  .object({
    status: z.enum(["draft_ready", "needs_plan_revision", "blocked"]),
    status_note: text(4000),
    article_markdown: text(60000),
    claims_used: z
      .array(
        z
          .object({
            claim_text: text(1500),
            fact_ids: list(text(16), 20),
            section_id: text(24),
          })
          .strict(),
      )
      .transform((items) => items.slice(0, 500)),
    deviations_from_plan: list(text(800), 20),
    unresolved_gaps: list(text(800), 20),
  })
  .strict();
const writerOutputJson = obj({
  status: {
    type: "string",
    enum: ["draft_ready", "needs_plan_revision", "blocked"],
  },
  status_note: str,
  article_markdown: str,
  claims_used: {
    type: "array",
    items: obj({ claim_text: str, fact_ids: strs, section_id: str }),
  },
  deviations_from_plan: strs,
  unresolved_gaps: strs,
});

/** Writes the whole edition as one Markdown article from the confirmed outline. */
export async function draftNewsletter(
  input: NewsletterAgentInput,
): Promise<StageResult> {
  if (input.payload.plan?.status !== "ready")
    return {
      ok: false,
      message: "The outline is not ready. Regenerate it before drafting.",
    };
  const config = getOpenRouterConfig("LLM_NEWSLETTER_WRITE_MODEL");
  if (!config) return { ok: false, message: NOT_CONFIGURED };
  const prompt = await newsletterPrompt(input, "write", {
    newsletter_plan: planForPrompt(input),
  });
  if (Buffer.byteLength(prompt.user) > PROMPT_BYTE_LIMIT)
    return { ok: false, message: TOO_LARGE };
  const result = await requestStructuredCompletion(
    config,
    [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    writerOutputSchema,
    writerOutputJson,
    "newsletter-write",
    { timeoutMs: 120000, maxTokens: 14000, temperature: 0.4 },
    input.clientId,
    input.userId,
    "newsletter_draft",
  );
  if (!result.ok)
    return {
      ok: false,
      message: "The draft could not be written. Nothing was used up; try again.",
    };
  const out = result.data;
  if (out.status !== "draft_ready")
    return {
      ok: false,
      message: `The writer needs a changed outline before it can draft. ${[out.status_note, ...out.unresolved_gaps].filter(Boolean).join(" ")}`.trim(),
    };
  const article = out.article_markdown.trim();
  if (article.length < 200)
    return {
      ok: false,
      message: "The draft came back too short to use. Try again.",
    };
  return {
    ok: true,
    payload: {
      ...input.payload,
      article,
      claims: out.claims_used.map((c) => ({
        claimText: c.claim_text,
        factIds: c.fact_ids,
        sectionId: c.section_id,
      })),
    },
  };
}

/* -------------------------------------------------------------- QA stage */

const qaOutputJson = obj({
  decision: { type: "string", enum: ["pass", "revise", "replan", "blocked"] },
  hard_gates: obj({
    source_boundary: { type: "string", enum: ["pass", "fail"] },
    numeric_and_date_integrity: { type: "string", enum: ["pass", "fail"] },
    claim_to_evidence: { type: "string", enum: ["pass", "fail"] },
    editorial_coherence: { type: "string", enum: ["pass", "fail"] },
    publishing_integrity: { type: "string", enum: ["pass", "fail"] },
  }),
  score: obj({
    evidence: int,
    reader_relevance: int,
    usefulness: int,
    structure: int,
    clarity_voice: int,
    headline_hook: int,
    citations: int,
    cta: int,
  }),
  issues: {
    type: "array",
    items: obj({
      issue_id: str,
      severity: { type: "string", enum: ["critical", "major", "moderate", "minor"] },
      category: str,
      location: str,
      problem: str,
      evidence_notes: str,
      fact_ids: strs,
      required_fix: str,
      route_to: { type: "string", enum: ["writing", "planning"] },
    }),
  },
  claim_audit: obj({
    checked_claim_count: int,
    supported_claim_count: int,
    unsupported_claim_count: int,
    unverified_claim_count: int,
    missing_citation_count: int,
  }),
  strengths_to_preserve: strs,
});

/** Independent review of the saved article. Advice only: it never approves. */
export async function reviewNewsletter(
  input: NewsletterAgentInput,
): Promise<StoredQa> {
  const checks = newsletterChecks(input.payload, input.sources);
  const config = getOpenRouterConfig("LLM_NEWSLETTER_QA_MODEL");
  if (!config)
    return unavailableQa(checks, "AI review is unavailable. Nothing was checked by AI.");
  const prompt = await newsletterPrompt(input, "qa", {
    newsletter_plan: planForPrompt(input),
    newsletter_draft: {
      article_markdown: input.payload.article ?? "",
      claims_used: (input.payload.claims ?? []).map((c) => ({
        claim_text: c.claimText,
        fact_ids: c.factIds,
        section_id: c.sectionId,
      })),
    },
    automatic_checks: checks,
  });
  if (Buffer.byteLength(prompt.user) > PROMPT_BYTE_LIMIT)
    return unavailableQa(
      checks,
      "The context exceeds the model budget; no selected facts were truncated, so AI review did not run.",
    );
  const result = await requestStructuredCompletion(
    config,
    [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    qaReportSchema,
    qaOutputJson,
    "newsletter-qa",
    { timeoutMs: 90000, maxTokens: 8000, temperature: 0.1 },
    input.clientId,
    input.userId,
    "newsletter_qa",
  );
  if (!result.ok)
    return unavailableQa(checks, "Independent AI review did not complete.");
  return toStoredQa(result.data, checks);
}
