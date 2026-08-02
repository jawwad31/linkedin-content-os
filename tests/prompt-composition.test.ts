import { describe, expect, it } from "vitest";

import { buildPlanningPrompt } from "@/features/ideas/agents/planning-agent";
import {
  buildContentPrompt,
  type ContentAgentIdeaContext,
} from "@/features/posts/agents/content-agent";
import { buildReviewPrompt } from "@/features/posts/agents/review-agent";

import {
  businessContextFixture,
  compatibilityFixture,
  ideaFixture,
  planFixture,
  resourcesFixture,
  sourceFixture,
} from "./fixtures/generation-inputs";

describe("stage prompt composition", () => {
  it.each(["founder_experience", "trend_card", "trend_reaction"] as const)(
    "injects only the selected %s source mode into planning",
    async (mode) => {
      const source = sourceFixture(mode);
      const prompt = await buildPlanningPrompt({
        businessContext: businessContextFixture,
        sourceContext: {
          mode,
          sourceId: source.sourceIds[0],
          sourceTitle: source.sourceTitle ?? "Source",
          source: source.source,
          sourceArticles: source.sourceArticles,
          linkedTrendCard: source.linkedTrendCard,
        },
        recentAngles: [],
        compatibility: compatibilityFixture(mode),
        resources: resourcesFixture,
      });
      const payload = JSON.parse(prompt.user);
      expect(payload.selected_source.mode).toBe(mode);
      expect(prompt.system).toContain("Source and Proof Safety");
      expect(prompt.system).toContain("exact taxonomy IDs");
    },
  );

  it("drafts from the stored plan and selected source", async () => {
    const prompt = await buildContentPrompt({
      businessContext: businessContextFixture,
      idea: { ...ideaFixture(), editNote: "Make the opening more direct." },
      sourceContext: sourceFixture("founder_experience"),
    });
    const payload = JSON.parse(prompt.user);
    expect(payload.generation_plan.strategy.coreArgument).toBe(
      planFixture.strategy.coreArgument,
    );
    expect(payload.selected_source.sourceType).toBe("founder_experience");
    expect(payload.content_idea.edit_note).toBe("Make the opening more direct.");
    expect(prompt.system).toContain("private scaffolding");
    expect(prompt.system).not.toContain("Article Classification");
  });

  it("no longer sends the idea-level fields duplicated by the generation plan", async () => {
    const prompt = await buildContentPrompt({
      businessContext: businessContextFixture,
      idea: ideaFixture(),
      sourceContext: sourceFixture("founder_experience"),
    });
    const payload = JSON.parse(prompt.user);

    expect(Object.keys(payload.content_idea)).toEqual([
      "id",
      "angle",
      "buyer_pain",
      "commercial_relevance",
      "founder_direction",
      "edit_note",
    ]);
  });

  it("gives QA the draft, plan, source, and deterministic findings", async () => {
    const idea = ideaFixture() as ContentAgentIdeaContext;
    const prompt = await buildReviewPrompt({
      businessContext: businessContextFixture,
      idea,
      sourceContext: sourceFixture("founder_experience"),
      plan: planFixture,
      draft: {
        hook: "Fix routing before adding volume.",
        body: "The review found 12% duplicate routing.",
        cta: "Check routing first.",
        format: "text",
        proofUsed: "Documented routing review.",
        riskNotes: "Do not generalize.",
      },
      deterministicIssues: [],
    });
    const payload = JSON.parse(prompt.user);
    expect(payload.generation_plan.execution.bodyFramework).toBe(
      "mistake_lesson",
    );
    expect(payload.draft.body).toContain("12%");
    expect(prompt.system).toContain("Final QA and Format Recommendation");
    expect(prompt.system).not.toContain("This is a corrective pass.");
  });

  it("tells QA a corrective pass reviews the already-reviewed draft, not the original", async () => {
    const idea = ideaFixture() as ContentAgentIdeaContext;
    const priorQa = {
      verdict: "revised" as const,
      finalPost: "The review found 12% duplicate routing. Fix routing first.",
      finalCta: "Fix routing first.",
      proofNotes: "Documented routing review.",
      riskNotes: "Do not generalize.",
      checks: {
        sourceFidelity: "pass" as const,
        credibility: "pass" as const,
        icpFit: "pass" as const,
        beliefShiftClarity: "pass" as const,
        voice: "pass" as const,
        structure: "pass" as const,
        ctaFit: "pass" as const,
        readability: "pass" as const,
      },
      issues: [],
      revisionsMade: [],
      formatRecommendation: null,
    };
    const prompt = await buildReviewPrompt({
      businessContext: businessContextFixture,
      idea,
      sourceContext: sourceFixture("founder_experience"),
      plan: planFixture,
      draft: {
        hook: "",
        body: priorQa.finalPost,
        cta: priorQa.finalCta,
        format: "text",
        proofUsed: priorQa.proofNotes,
        riskNotes: priorQa.riskNotes,
      },
      deterministicIssues: [
        { code: "unsupported_numeric_claim", detail: "Numeric claim: 12%" },
      ],
      priorQa,
    });
    const payload = JSON.parse(prompt.user);
    expect(prompt.system).toContain("This is a corrective pass.");
    expect(payload.draft.body).toBe(priorQa.finalPost);
    expect(payload.prior_qa.finalPost).toBe(priorQa.finalPost);
  });

  it("tells the Content Agent not to fake quotation marks around paraphrased beliefs", async () => {
    const prompt = await buildContentPrompt({
      businessContext: businessContextFixture,
      idea: ideaFixture(),
      sourceContext: sourceFixture("founder_experience"),
    });
    expect(prompt.system).toContain("Quotation marks are reserved for exact evidence quotes");
  });
});
