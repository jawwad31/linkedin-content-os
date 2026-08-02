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
  });
});
