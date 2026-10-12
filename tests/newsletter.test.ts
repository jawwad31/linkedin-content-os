import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  articleToPlainText,
  editionStage,
  exportEdition,
  exportEditionHtml,
  newsletterChecks,
  normalizeQa,
  qaBlocksApproval,
  toStoredQa,
  validateSourceArrangement,
  type EditionInput,
  type NewsletterSource,
  type QaReport,
} from "@/features/newsletter/contracts";
import {
  aliasSources,
  draftNewsletter,
  newsletterPrompt,
  planNewsletter,
  reviewNewsletter,
  type NewsletterAgentInput,
} from "@/features/newsletter/agent";

const mocks = vi.hoisted(() => ({ config: vi.fn(), request: vi.fn() }));
vi.mock("@/lib/openrouter/client", () => ({
  getOpenRouterConfig: mocks.config,
  requestStructuredCompletion: mocks.request,
}));

const A = "fa49c8aa-d191-43f7-8f97-50c819089bfb"; // research finding, becomes S01
const B = "fb49c8aa-d191-43f7-8f97-50c819089bfb"; // the author's experience, becomes S02
const edition: EditionInput = {
  title: "Useful developments",
  startDate: "2026-10-01",
  endDate: "2026-10-07",
  reader: "The business's primary ideal customer",
  depth: "standard",
  sections: [
    { heading: "Evidence", sourceIds: [A], commentary: "", body: "" },
    { heading: "Experience", sourceIds: [B], commentary: "", body: "" },
  ],
};
const sources: NewsletterSource[] = [
  {
    source_id: A,
    source_type: "research_finding",
    snapshot: {
      title: "Evidence",
      sources: [
        { url: "https://example.com/change", publishedOn: "2026-01-01" },
      ],
      fingerprint: "secret-fingerprint",
    },
    content_hash: "hash",
    usage_id: null,
  },
  {
    source_id: B,
    source_type: "founder_experience",
    snapshot: { title: "We rebuilt onboarding", entryType: "work_log" },
    content_hash: "hash2",
    usage_id: null,
  },
];
const input: NewsletterAgentInput = {
  clientId: A,
  userId: A,
  payload: edition,
  sources,
  profile: {
    industry: null,
    businessDescription: "Whole profile context",
    primaryIcp: "Owners of small agencies",
    mainOffer: null,
    approvedProof: [],
    bannedTopics: [],
    voiceGuide: "Plain and direct",
    founderVoiceSample: null,
    founderVoiceExamples: [],
    phrasesToUse: [],
    phrasesToAvoid: [],
    boundaries: "Never disclose client names",
  },
  excerpts: [],
  today: "2026-10-12",
};
const fact = (id: string, aliases: string[]) => ({
  fact_id: id,
  claim: `Claim ${id}`,
  source_ids: aliases,
  evidence_excerpt: "Excerpt",
  evidence_type: "reported" as const,
  as_of: "2026-01-01",
  scope_and_qualifiers: "",
  confidence: "moderate" as const,
  writing_permission: "allowed" as const,
});
const section = (id: string, heading: string, facts: string[]) => ({
  section_id: id,
  working_heading: heading,
  reader_question: "Why?",
  section_purpose: "Explain",
  key_points: ["A point"],
  fact_ids: facts,
  interpretation: "Reading",
  practical_takeaway: "Do this",
  transition: "Next",
  target_words: 300,
  risk_flags: [],
});
const planOut = (over: Record<string, unknown> = {}) => ({
  status: "ready",
  status_note: "",
  audience: {
    description: "Agency owners",
    job_to_be_done: "Decide",
    reader_problem: "Unclear",
    technical_depth: "intermediate",
    intended_reader_transformation: "Acts",
  },
  editorial_angle: {
    thesis: "Because X, do Y",
    reader_transformation: "Acts",
    why_now: "Now",
    central_tension: "Tension",
  },
  issue_format: "signal_implication_response",
  recommended_title: "A title",
  title_options: ["A title", "Other"],
  opening_promise: "Promise",
  allowed_fact_ledger: [fact("F01", ["S01"]), fact("F02", ["S02"])],
  outline: [
    section("SEC01", "What changed", ["F01"]),
    section("SEC02", "What we learned", ["F02"]),
  ],
  closing_plan: { takeaway: "Take", primary_cta: "Ask" },
  writing_constraints: {
    target_word_count: 1100,
    must_attribute: ["F01"],
    forbidden_unverified_claims: [],
  },
  open_questions: [],
  research_gaps: [],
  ...over,
});
const readyPayload = async (): Promise<EditionInput> => {
  mocks.request.mockResolvedValueOnce({ ok: true, data: planOut() });
  const planned = await planNewsletter(input);
  if (!planned.ok) throw new Error("plan failed");
  return planned.payload;
};

beforeEach(() => {
  mocks.config.mockReset();
  mocks.request.mockReset();
  mocks.config.mockReturnValue({ apiKey: "test", model: "test" });
});

describe("contracts and export", () => {
  it("lets a source feed several sections but never leaves one out", () => {
    const selected = [
      { id: A, type: "research_finding" as const, reuseConfirmed: false },
      { id: B, type: "founder_experience" as const, reuseConfirmed: false },
    ];
    expect(validateSourceArrangement(edition, selected)).toBe(true);
    expect(
      validateSourceArrangement(
        {
          ...edition,
          sections: [
            { ...edition.sections[0], sourceIds: [A, B] },
            { ...edition.sections[1], sourceIds: [B] },
          ],
        },
        selected,
      ),
    ).toBe(true);
    expect(
      validateSourceArrangement(
        { ...edition, sections: [edition.sections[0]] },
        selected,
      ),
    ).toBe(false);
    expect(validateSourceArrangement(edition, [])).toBe(false);
  });
  it("exports the article as plain text without evidence", () => {
    const text = exportEdition({
      ...edition,
      article:
        "# Headline\n\nFirst **bold** paragraph with a [source](https://example.com/change).\n\n## Part\n\n- one\n- two",
    });
    expect(text).toBe(
      "Headline\n\nFirst bold paragraph with a source (https://example.com/change).\n\nPart\n\n• one\n• two",
    );
    expect(articleToPlainText("a\n\n\n\nb")).toBe("a\n\nb");
  });
  it("still exports an edition written before the plan stage", () => {
    expect(
      exportEdition({
        ...edition,
        sections: [{ ...edition.sections[0], body: "Old body" }],
      }),
    ).toBe("Useful developments\n\nEvidence\n\nOld body");
  });
  it("flags unverified links, internal labels and repeated paragraphs", () => {
    const long = "A repeated paragraph that is comfortably longer than eighty characters so it counts.";
    const issues = newsletterChecks(
      {
        ...edition,
        article: `${long}\n\n${long}\n\nSee https://unknown.example.org/page and fact F01 from S02.`,
      },
      sources,
    );
    const joined = issues.join(" ");
    expect(joined).toContain("unverified or private link");
    expect(joined).toContain("Repeated paragraphs");
    expect(joined).toContain("internal labels");
  });
  it("accepts a public source link and rejects a signed storage link", () => {
    expect(
      newsletterChecks(
        { ...edition, article: "# T\n\nRead https://example.com/change today." },
        sources,
      ),
    ).toEqual([]);
    const signed =
      "https://example.supabase.co/storage/v1/object/sign/private?token=secret";
    expect(
      newsletterChecks({ ...edition, article: `Get ${signed}` }, sources).join(" "),
    ).toContain("private evidence");
  });
  it("always spaces blocks for LinkedIn, however the model wrapped its lines", () => {
    const messy =
      "# Title\n## Part one\nA paragraph that the model\nwrapped over two lines.\n- one\n- two\nAnother paragraph right after the list.\n1. first\n2. second";
    expect(articleToPlainText(messy)).toBe(
      "Title\n\nPart one\n\nA paragraph that the model wrapped over two lines.\n\n• one\n• two\n\nAnother paragraph right after the list.\n\n1. first\n2. second",
    );
  });
  it("offers a rich version with only safe markup and public links", () => {
    const html = exportEditionHtml({
      ...edition,
      article:
        "# T\n\nSee [notes](https://example.com/n), [local](http://localhost/x) & <b>raw</b>.\n\n- a",
    });
    expect(html).toBe(
      '<h1>T</h1><p>See <a href="https://example.com/n">notes</a>, local &amp; &lt;b&gt;raw&lt;/b&gt;.</p><ul><li>a</li></ul>',
    );
  });
  it("flags layout that will not survive a paste", () => {
    const issues = newsletterChecks(
      {
        ...edition,
        article: `No headings here.\n\n${"word ".repeat(300)}\n\n| a | b |\n| - | - |`,
      },
      sources,
    ).join(" ");
    expect(issues).toContain("no headings");
    expect(issues).toContain("very long");
    expect(issues).toContain("Tables do not paste");
  });
  it("reads the older QA shape and never lets a failed gate read as a pass", () => {
    const legacy = normalizeQa({
      verdict: "needs_edit",
      issues: ["Fix it"],
      proofNotes: "x",
    });
    expect(legacy?.decision).toBe("revise");
    expect(legacy?.issues[0].problem).toBe("Fix it");
    expect(normalizeQa({ nonsense: true })).toBeNull();
    const report: QaReport = {
      decision: "pass",
      hard_gates: {
        source_boundary: "fail",
        numeric_and_date_integrity: "pass",
        claim_to_evidence: "pass",
        editorial_coherence: "pass",
        publishing_integrity: "pass",
      },
      score: {
        evidence: 20,
        reader_relevance: 10,
        usefulness: 10,
        structure: 5,
        clarity_voice: 5,
        headline_hook: 5,
        citations: 3,
        cta: 2,
      },
      issues: [],
      claim_audit: {
        checked_claim_count: 3,
        supported_claim_count: 3,
        unsupported_claim_count: 0,
        unverified_claim_count: 0,
        missing_citation_count: 0,
      },
      strengths_to_preserve: [],
    };
    const stored = toStoredQa(report, ["Check a link"]);
    expect(stored.decision).toBe("revise");
    expect(stored.score).toBe(60);
    expect(stored.issues[0].origin).toBe("check");
    const critical = toStoredQa(
      {
        ...report,
        hard_gates: { ...report.hard_gates, source_boundary: "pass" },
        issues: [
          {
            issue_id: "Q1",
            severity: "critical",
            category: "fact",
            location: "SEC01",
            problem: "Invented number",
            evidence_notes: "",
            fact_ids: [],
            required_fix: "Remove",
            route_to: "writing",
          },
        ],
      },
      [],
    );
    expect(critical.decision).toBe("revise");
    expect(qaBlocksApproval(normalizeQa(critical))).toBe(true);
    expect(qaBlocksApproval(null)).toBe(true);
    expect(qaBlocksApproval(normalizeQa(stored))).toBe(false);
  });
  it("names where an edition stands", () => {
    const e = {
      status: "outline" as const,
      revision: 2,
      outline_revision: null,
      approved_revision: null,
    };
    expect(editionStage(e, edition)).toBe("outline_needs_review");
    expect(editionStage({ ...e, outline_revision: 2 }, edition)).toBe(
      "outline_confirmed",
    );
    expect(
      editionStage(e, { ...edition, plan: { status: "research_gap" } }),
    ).toBe("outline_blocked");
    expect(editionStage({ ...e, status: "review" }, { ...edition, article: "Text" })).toBe(
      "draft_ready",
    );
    expect(
      editionStage(
        { ...e, status: "approved", approved_revision: 2 },
        { ...edition, article: "Text" },
      ),
    ).toBe("approved");
    expect(
      editionStage(
        { ...e, status: "approved", approved_revision: 1 },
        { ...edition, article: "Text" },
      ),
    ).toBe("draft_ready");
  });
});

describe("plan stage", () => {
  it("uses the planning skill, shared rules and the whole profile, with source aliases", async () => {
    const prompt = await newsletterPrompt(input, "plan");
    expect(prompt.system).toContain("Stage 1 — Newsletter Planning Skill");
    expect(prompt.system).toContain("Rules of the Virel app");
    expect(prompt.system).toContain("Newsletter Editorial Standards");
    // The retired niche templates are gone; reader and voice come from the profile.
    expect(prompt.system).not.toContain("agency_operator");
    expect(prompt.system).not.toContain("Practitioner + Operator + Systems Thinker");
    expect(prompt.user).toContain("Whole profile context");
    expect(prompt.user).toContain("Owners of small agencies");
    expect(prompt.user).toContain("Never disclose client names");
    expect(prompt.user).toContain('"source_id":"S01"');
    expect(prompt.user).toContain('"source_kind":"author_experience"');
    expect(prompt.user).not.toContain(A);
    expect(prompt.user).not.toContain("secret-fingerprint");
    expect(prompt.user).toContain("2026-10-12");
  });
  it("gives the same source the same alias in every stage", () => {
    const { toAlias } = aliasSources([...sources].reverse());
    expect(toAlias.get(A)).toBe("S01");
    expect(toAlias.get(B)).toBe("S02");
  });
  it("turns a ready plan into sections with real source ids and a saved fact ledger", async () => {
    const payload = await readyPayload();
    expect(payload.plan?.status).toBe("ready");
    expect(payload.sections.map((s) => s.heading)).toEqual([
      "What changed",
      "What we learned",
    ]);
    expect(payload.sections[0].sourceIds).toEqual([A]);
    expect(payload.sections[1].sourceIds).toEqual([B]);
    expect(payload.plan?.factLedger?.[0]).toMatchObject({
      factId: "F01",
      sourceIds: [A],
    });
    expect(payload.title).toBe("Useful developments");
    expect(payload.article).toBeUndefined();
    expect(validateSourceArrangement(payload, [
      { id: A, type: "research_finding", reuseConfirmed: false },
      { id: B, type: "founder_experience", reuseConfirmed: false },
    ])).toBe(true);
  });
  it("keeps every selected source placed and flags the one the planner left out", async () => {
    mocks.request.mockResolvedValueOnce({
      ok: true,
      data: planOut({
        allowed_fact_ledger: [fact("F01", ["S01"])],
        outline: [section("SEC01", "Only one", ["F01"])],
      }),
    });
    const planned = await planNewsletter(input);
    expect(planned.ok && planned.payload.sections[0].sourceIds).toEqual([A, B]);
    expect(planned.ok && planned.payload.plan?.unusedSourceIds).toEqual([B]);
  });
  it("drops invented facts and lets a section without facts follow the one before it", async () => {
    mocks.request.mockResolvedValueOnce({
      ok: true,
      data: planOut({
        allowed_fact_ledger: [
          fact("F01", ["S01"]),
          fact("F02", ["S02"]),
          fact("F03", ["S09"]),
        ],
        outline: [
          section("SEC01", "First", ["F01", "F99"]),
          section("SEC02", "Second", ["F02"]),
          section("SEC03", "Apply it", []),
        ],
      }),
    });
    const planned = await planNewsletter(input);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.payload.plan?.factLedger?.map((f) => f.factId)).toEqual([
      "F01",
      "F02",
    ]);
    expect(planned.payload.sections[0].factIds).toEqual(["F01"]);
    expect(planned.payload.sections[2].sourceIds).toEqual([B]);
  });
  it("records why the material is not enough and keeps the placeholder sections", async () => {
    mocks.request.mockResolvedValueOnce({
      ok: true,
      data: planOut({
        status: "research_gap",
        status_note: "Only one dated claim.",
        outline: [],
        allowed_fact_ledger: [],
        research_gaps: ["Need the release date"],
      }),
    });
    const planned = await planNewsletter(input);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.payload.plan).toMatchObject({
      status: "research_gap",
      statusNote: "Only one dated claim.",
      researchGaps: ["Need the release date"],
    });
    expect(planned.payload.sections).toEqual(edition.sections);
  });
  it("treats a ready plan with no usable outline as not enough, never as an outline", async () => {
    mocks.request.mockResolvedValueOnce({
      ok: true,
      data: planOut({ outline: [], allowed_fact_ledger: [] }),
    });
    const planned = await planNewsletter(input);
    expect(planned.ok && planned.payload.plan?.status).toBe("research_gap");
  });
  it("cuts over-long model text to the stored limit instead of discarding a good plan", async () => {
    // The real client validates with the stage's schema, so run the same schema here.
    mocks.request.mockImplementationOnce(
      async (_config: unknown, _messages: unknown, schema: { parse: (v: unknown) => unknown }) => ({
        ok: true,
        data: schema.parse(
          planOut({
            issue_format: "x".repeat(500),
            audience: {
              ...planOut().audience,
              technical_depth: "intermediate and then some ".repeat(20),
            },
            open_questions: Array.from({ length: 40 }, (_, i) => `Question ${i}`),
          }),
        ),
      }),
    );
    const planned = await planNewsletter(input);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    expect(planned.payload.plan?.issueFormat).toHaveLength(120);
    expect(planned.payload.plan?.audience?.technicalDepth).toHaveLength(40);
    expect(planned.payload.plan?.openQuestions).toHaveLength(20);
  });
  it("fails safely when the AI is missing or the call fails", async () => {
    mocks.config.mockReturnValue(null);
    expect((await planNewsletter(input)).ok).toBe(false);
    mocks.config.mockReturnValue({ apiKey: "test", model: "test" });
    mocks.request.mockResolvedValueOnce({ ok: false, errorType: "timeout" });
    expect((await planNewsletter(input)).ok).toBe(false);
  });
});

describe("write stage", () => {
  const written = (over: Record<string, unknown> = {}) => ({
    status: "draft_ready",
    status_note: "",
    article_markdown: `# A title\n\n${"Body text. ".repeat(40)}`,
    claims_used: [{ claim_text: "A claim", fact_ids: ["F01"], section_id: "SEC01" }],
    deviations_from_plan: [],
    unresolved_gaps: [],
    ...over,
  });
  it("refuses to write without a ready outline", async () => {
    const result = await draftNewsletter(input);
    expect(result.ok).toBe(false);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("sends the confirmed outline, writes one article and keeps the claim map", async () => {
    const payload = await readyPayload();
    mocks.request.mockResolvedValueOnce({ ok: true, data: written() });
    const result = await draftNewsletter({ ...input, payload });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.article).toContain("# A title");
    expect(result.payload.claims).toEqual([
      { claimText: "A claim", factIds: ["F01"], sectionId: "SEC01" },
    ]);
    expect(result.payload.sections).toEqual(payload.sections);
    const system = mocks.request.mock.calls[1][1][0].content as string;
    const user = mocks.request.mock.calls[1][1][1].content as string;
    expect(system).toContain("Stage 2 — Newsletter Writing Skill");
    expect(user).toContain("newsletter_plan");
    expect(user).toContain('"fact_id":"F01"');
    expect(user).toContain('"source_ids":["S01"]');
    expect(user).not.toContain(A);
  });
  it("reports why the outline has to change instead of inventing text", async () => {
    const payload = await readyPayload();
    mocks.request.mockResolvedValueOnce({
      ok: true,
      data: written({
        status: "needs_plan_revision",
        status_note: "Section 2 has no support.",
        article_markdown: "",
      }),
    });
    const result = await draftNewsletter({ ...input, payload });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain("Section 2 has no support.");
    mocks.request.mockResolvedValueOnce({
      ok: true,
      data: written({ article_markdown: "Too short" }),
    });
    expect((await draftNewsletter({ ...input, payload })).ok).toBe(false);
  });
});

describe("QA stage", () => {
  const withArticle = async (article: string) => ({
    ...input,
    payload: { ...(await readyPayload()), article },
  });
  it("reports unavailable QA as a needed review, never a pass, and keeps the automatic checks", async () => {
    mocks.config.mockReturnValue(null);
    const qa = await reviewNewsletter({
      ...input,
      payload: { ...edition, article: "Text with https://unknown.example.org/x" },
    });
    expect(qa.decision).toBe("revise");
    expect(qa.issues.map((i) => i.problem).join(" ")).toContain("AI review is unavailable");
    expect(qa.issues.map((i) => i.problem).join(" ")).toContain("unverified or private link");
  });
  it("adds the automatic checks to what the reviewer found and never lets a pass hide a leak", async () => {
    const agent = await withArticle(
      `# T\n\n${"Clean paragraph. ".repeat(20)}\n\nInternal label F01 leaked.`,
    );
    mocks.request.mockResolvedValueOnce({
      ok: true,
      data: {
        decision: "pass",
        hard_gates: {
          source_boundary: "pass",
          numeric_and_date_integrity: "pass",
          claim_to_evidence: "pass",
          editorial_coherence: "pass",
          publishing_integrity: "pass",
        },
        score: {
          evidence: 25,
          reader_relevance: 12,
          usefulness: 12,
          structure: 8,
          clarity_voice: 8,
          headline_hook: 8,
          citations: 4,
          cta: 4,
        },
        issues: [],
        claim_audit: {
          checked_claim_count: 4,
          supported_claim_count: 4,
          unsupported_claim_count: 0,
          unverified_claim_count: 0,
          missing_citation_count: 0,
        },
        strengths_to_preserve: ["Clear opening"],
      },
    });
    const qa = await reviewNewsletter(agent);
    expect(qa.score).toBe(81);
    expect(qa.issues.some((i) => i.origin === "check")).toBe(true);
    expect(qa.strengths).toEqual(["Clear opening"]);
    const system = mocks.request.mock.calls[1][1][0].content as string;
    const user = mocks.request.mock.calls[1][1][1].content as string;
    expect(system).toContain("Stage 3 — Newsletter QA Skill");
    expect(user).toContain("newsletter_draft");
    expect(user).toContain("automatic_checks");
  });
  it("falls back to an unavailable report when the reviewer call fails", async () => {
    const agent = await withArticle(`# T\n\n${"Clean paragraph. ".repeat(20)}`);
    mocks.request.mockResolvedValueOnce({ ok: false, errorType: "timeout" });
    const qa = await reviewNewsletter(agent);
    expect(qa.decision).toBe("revise");
    expect(qa.score).toBeNull();
  });
});
