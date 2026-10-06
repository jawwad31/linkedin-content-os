import { describe, expect, it } from "vitest";

import {
  ALLOCATION_BUCKETS,
  FUNNEL_STAGES,
  POST_TYPES,
} from "@/lib/ai/playbooks/taxonomies";
import {
  adaptGenerationPlan,
  applyStrategyOverrides,
  type GenerationPlanV2,
} from "@/lib/ai/playbooks/contracts";
import { buildContentPrompt } from "@/features/posts/agents/content-agent";
import {
  editPostContentSchema,
} from "@/features/posts/review/schemas";
import {
  standaloneDraftInputSchema,
} from "@/features/posts/generate/standalone-service";

import {
  businessContextFixture,
  ideaFixture,
  planFixture,
  sourceFixture,
} from "./fixtures/generation-inputs";

describe("P04: Shared Standalone Writer & Editorial Controls", () => {
  describe("Taxonomies and Editorial Schemas", () => {
    it("enforces all 8 post types, 4 funnel stages, and 4 allocation buckets", () => {
      expect(POST_TYPES).toEqual([
        "framework",
        "case_study",
        "contrarian_take",
        "how_to",
        "teardown",
        "listicle",
        "story",
        "lead_magnet_offer",
      ]);

      expect(FUNNEL_STAGES).toEqual([
        "Discovery",
        "Depth",
        "Authority",
        "Commercial",
      ]);

      expect(ALLOCATION_BUCKETS).toEqual([
        "experience",
        "asset",
        "evergreen",
        "news",
      ]);
    });

    it("validates standalone draft inputs across all source paths", () => {
      const validSources = [
        { sourceType: "founder_experience", sourceId: "d3b07384-d113-4ec6-b333-8ec23f39a0c1" },
        { sourceType: "content_resource", sourceId: "d3b07384-d113-4ec6-b333-8ec23f39a0c2", allocationBucket: "asset" },
        { sourceType: "profile_led", allocationBucket: "evergreen", funnelStage: "Discovery" },
        { sourceType: "custom_upload", customNotes: "# Architecture Notes\nEvidence points here." },
        { sourceType: "trend_card", allocationBucket: "news" },
        { sourceType: "research_brief", allocationBucket: "news", funnelStage: "Authority" },
      ];

      for (const src of validSources) {
        const parsed = standaloneDraftInputSchema.safeParse(src);
        expect(parsed.success).toBe(true);
      }
    });

    it("rejects invalid post types or funnel stages in input", () => {
      const invalid = standaloneDraftInputSchema.safeParse({
        sourceType: "founder_experience",
        funnelStage: "TopOfTheFunnel", // Invalid funnel stage
      });
      expect(invalid.success).toBe(false);

      const invalidType = standaloneDraftInputSchema.safeParse({
        sourceType: "founder_experience",
        postType: "viral_thread", // Invalid post type
      });
      expect(invalidType.success).toBe(false);
    });
  });

  describe("GenerationPlanV2 Editorial Adaptation & Overrides", () => {
    it("persists editorial controls into the generation plan", () => {
      const overridden = applyStrategyOverrides(planFixture, {
        postType: "case_study",
        funnelStage: "Commercial",
        intendedReader: "Founders scaling past $1M ARR",
        primaryTakeaway: "Hiring SDRs before messaging product-market fit burns cash.",
        contentPillar: "Sales Architecture",
      });

      expect(overridden.editorial?.postType).toBe("case_study");
      expect(overridden.editorial?.funnelStage).toBe("Commercial");
      expect(overridden.editorial?.intendedReader).toBe("Founders scaling past $1M ARR");
      expect(overridden.editorial?.primaryTakeaway).toBe(
        "Hiring SDRs before messaging product-market fit burns cash.",
      );
      expect(overridden.editorial?.contentPillar).toBe("Sales Architecture");
    });

    it("adapts legacy generation plans lacking editorial block without loss", () => {
      const legacyPlan = {
        sourceMode: "founder_experience",
        strategy: planFixture.strategy,
        execution: planFixture.execution,
        safety: planFixture.safety,
      };

      const adapted = adaptGenerationPlan(legacyPlan);
      expect(adapted).not.toBeNull();
      expect(adapted?.editorial?.allocationBucket).toBe("experience");
      expect(adapted?.editorial?.postType).toBe("framework");
      expect(adapted?.editorial?.funnelStage).toBe("Depth");
    });
  });

  describe("Proof Safety: Profile-Led and Selected-Reader Prompt Calibration", () => {
    it("injects strict proof safety for profile-only educational drafts", async () => {
      const basePlan: GenerationPlanV2 = {
        ...planFixture,
        sourceMode: "profile_led",
        editorial: {
          allocationBucket: "evergreen",
          postType: "framework",
          funnelStage: "Depth",
          intendedReader: "Engineering Managers",
          primaryTakeaway: "Decouple services only when team coordination exceeds deploy cost.",
        },
      };

      const prompt = await buildContentPrompt({
        businessContext: businessContextFixture,
        idea: {
          ...ideaFixture(),
          generationPlan: basePlan,
        },
        sourceContext: {
          sourceType: "profile_led",
          sourceIds: [],
          sourceTitle: "Profile Principles",
          source: { principles: "Modularity over early optimization" },
          sourceArticles: [],
        },
      });

      // Verifies that profile-led drafting strictly forbids invented personal experiences
      expect(prompt.system).toContain("STRICT PROOF SAFETY (PROFILE-LED)");
      expect(prompt.system).toContain("Do NOT invent founder experiences, personal anecdotes");
      expect(prompt.system).toContain("Post Funnel Stage: Depth");
      expect(prompt.system).toContain("Target Intended Reader: \"Engineering Managers\"");
      expect(prompt.system).toContain("Primary Takeaway: \"Decouple services only when team coordination exceeds deploy cost.\"");
    });

    it("calibrates prompt for selected reader rather than forcing buyer-only ICP", async () => {
      const basePlan: GenerationPlanV2 = {
        ...planFixture,
        editorial: {
          allocationBucket: "experience",
          postType: "how_to",
          funnelStage: "Discovery",
          intendedReader: "Junior Frontend Engineers",
          primaryTakeaway: "Understand the event loop before reaching for external state libraries.",
        },
      };

      const prompt = await buildContentPrompt({
        businessContext: businessContextFixture,
        idea: {
          ...ideaFixture(),
          generationPlan: basePlan,
        },
        sourceContext: sourceFixture("founder_experience"),
      });

      expect(prompt.system).toContain("Target Intended Reader: \"Junior Frontend Engineers\"");
      expect(prompt.system).toContain("Calibrate tone, vocabulary, and tension specifically for this reader");
    });
  });

  describe("Approval Invalidation & Stale Approval Protection", () => {
    it("validates post edit schema across draft content and editorial brief", () => {
      const validEdit = editPostContentSchema.safeParse({
        finalPost: "Hook: Updated observation.\n\nBody: New empirical facts.",
        postType: "teardown",
        funnelStage: "Authority",
        intendedReader: "Staff Engineers",
        primaryTakeaway: "Refactoring without integration tests increases regression risk.",
      });

      expect(validEdit.success).toBe(true);
    });

    it("prohibits forging internal evidence and safety fields via edit schema", () => {
      const maliciousEdit = editPostContentSchema.safeParse({
        finalPost: "A new post",
        proofNotes: "Forged proof",
        riskNotes: "No risks",
        status: "approved", // Attempting to self-approve
      });

      // Strict zod schema strips or rejects unpermitted keys
      const data = maliciousEdit.success ? (maliciousEdit.data as Record<string, unknown>) : {};
      expect(data.proofNotes).toBeUndefined();
      expect(data.riskNotes).toBeUndefined();
      expect(data.status).toBeUndefined();
    });
  });
});
