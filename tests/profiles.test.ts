import { describe, expect, it } from "vitest";

import {
  businessContextFormSchema,
  toClientContextUpdate,
} from "@/features/setup/schemas";
import { canRoleManageClientSetup } from "@/lib/access/roles";
import { buildContentPrompt } from "@/features/posts/agents/content-agent";
import { buildPlanningPrompt } from "@/features/ideas/agents/planning-agent";
import { planFixture } from "./fixtures/generation-inputs";

describe("Two Context Profiles (P01)", () => {
  it("validates minimal valid business and personal profile input", () => {
    const parsed = businessContextFormSchema.safeParse({
      name: "Acme Corp",
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const update = toClientContextUpdate(parsed.data, 1);
    expect(update.name).toBe("Acme Corp");
    expect(update.profile_revision).toBe(2);
    expect(update.personal_positioning).toBeNull();
    expect(update.personal_readers).toBeNull();
  });

  it("validates and maps complete business and personal profile input", () => {
    const input = {
      name: "Virel Labs",
      industry: "B2B SaaS",
      businessDescription: "AI Operating System for LinkedIn content.",
      primaryIcp: "Founders and CMOs",
      audienceUnderstanding: "They want organic reach without generic fluff.",
      painPoints: "Ghostwriters lack domain depth; founders have no time.",
      mainOffer: "Done-with-you content system",
      commercialDetails: "$3k/month retainer, 30-day guarantee",
      deliveryApproach: "Sprint-based workflow",
      businessPositioning: "Evidence-backed vs generic AI wrappers",
      questionsAndDoubts: "Will this sound like me?",
      bannedTopics: "crypto\npolitics",
      approvedProof: "Generated 10M views in Q3\nClosed $200k pipeline",

      founderName: "Alex Rivera",
      roleAndWork: "Founder & Technical Lead",
      personalPositioning: "Engineering leadership and pragmatic AI systems",
      personalReaders: "Software architects, engineering leaders, technical founders",
      contentPillars: "AI Engineering\nArchitecture Decisions\nTeam Culture",
      principles: "Proof over hype\nCode in production over slides",
      voiceGuide: "Direct, technical, candid, no fluff",
      founderVoiceSample: "Most AI wrappers miss the mark because...",
      phrasesToUse: "systems thinking\nevidence-based",
      phrasesToAvoid: "game-changing\nsynergy\nrevolutionary",
      boundaries: "No private client revenue numbers\nNo family topics",
      businessMentions: "Mention Virel only in bottom-of-funnel posts",

      voiceExample1Label: "Architecture Breakdown",
      voiceExample1Text: "Here is why we ditched microservices for a modular monolith...",
      voiceExample1Url: "https://linkedin.com/in/alex/post/1",
    };

    const parsed = businessContextFormSchema.safeParse(input);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const update = toClientContextUpdate(parsed.data, 5);
    expect(update.name).toBe("Virel Labs");
    expect(update.profile_revision).toBe(6);
    expect(update.role_and_work).toBe("Founder & Technical Lead");
    expect(update.personal_positioning).toBe("Engineering leadership and pragmatic AI systems");
    expect(update.personal_readers).toBe("Software architects, engineering leaders, technical founders");
    expect(update.content_pillars).toEqual([
      "AI Engineering",
      "Architecture Decisions",
      "Team Culture",
    ]);
    expect(update.banned_topics).toEqual(["crypto", "politics"]);
    expect(update.approved_proof).toEqual([
      "Generated 10M views in Q3",
      "Closed $200k pipeline",
    ]);
    expect(update.phrases_to_use).toEqual(["systems thinking", "evidence-based"]);
    expect(update.phrases_to_avoid).toEqual(["game-changing", "synergy", "revolutionary"]);
    expect(update.founder_voice_examples).toHaveLength(1);
    expect(update.founder_voice_examples[0].label).toBe("Architecture Breakdown");
  });

  it("enforces scoped admin editing and denies Account Users", () => {
    expect(canRoleManageClientSetup("agency_admin")).toBe(true);
    expect(canRoleManageClientSetup("client_admin")).toBe(true);
    expect(canRoleManageClientSetup("client_user")).toBe(false);
  });

  it("serializes both context profiles into planning agent user prompt", async () => {
    const prompt = await buildPlanningPrompt({
      businessContext: {
        industry: "B2B SaaS",
        businessDescription: "Software for agencies",
        primaryIcp: "Agency Owners",
        audienceUnderstanding: "Struggle with retention",
        painPoints: "High churn",
        mainOffer: "Agency OS",
        approvedProof: ["Grew MRR by 40%"],
        bannedTopics: ["Cold email spam"],
        founderName: "Jane Doe",
        roleAndWork: "CEO & Founder",
        personalPositioning: "Agency scaling expert",
        personalReaders: "Agency owners and operators",
        contentPillars: ["Agency Operations", "Client Retention"],
        principles: "Retain before acquiring",
        profileRevision: 3,
      },
      sourceContext: {
        mode: "founder_experience",
        sourceId: "123e4567-e89b-12d3-a456-426614174000",
        sourceTitle: "Client retention win",
        source: { what_happened: "Fixed onboarding churn" },
        sourceArticles: [],
      },
      recentAngles: [],
      compatibility: {
        archetypes: ["teardown"],
        structures: ["contrarian_shift"],
        frameworks: ["problem_agitate_solve"],
        hooks: ["curiosity_gap"],
        ctas: ["soft_comment"],
      },
      resources: [],
    });

    const parsedUser = JSON.parse(prompt.user);
    expect(parsedUser.business_context.industry).toBe("B2B SaaS");
    expect(parsedUser.business_context.personal_brand_profile.founder_name).toBe("Jane Doe");
    expect(parsedUser.business_context.personal_brand_profile.personal_readers).toBe("Agency owners and operators");
    expect(parsedUser.business_context.profile_revision).toBe(3);
  });

  it("serializes both profiles into content agent prompt and instructs on personal readership", async () => {
    const plan = planFixture;
    const prompt = await buildContentPrompt({
      businessContext: {
        industry: "AI Development",
        businessDescription: "Developer tooling",
        primaryIcp: "VP of Engineering",
        mainOffer: "Agent Platform",
        approvedProof: ["100k daily queries"],
        bannedTopics: [],
        founderVoiceSample: "I believe build systems should be invisible.",
        founderVoiceExamples: [],
        phrasesToUse: [],
        phrasesToAvoid: [],
        founderName: "David Kim",
        roleAndWork: "CTO",
        personalPositioning: "Developer infrastructure thought leader",
        personalReaders: "Staff engineers, principal engineers, engineering managers",
        profileRevision: 4,
      },
      idea: {
        id: "123e4567-e89b-12d3-a456-426614174001",
        sourceType: "founder_experience",
        angle: "Why CI pipelines fail at scale",
        buyerPain: "Slow feedback loops",
        commercialRelevance: "Platform accelerates CI",
        founderDirection: null,
        editNote: null,
        generationPlan: plan,
      },
      sourceContext: {
        sourceType: "founder_experience",
        sourceIds: ["123e4567-e89b-12d3-a456-426614174002"],
        sourceTitle: "Pipeline refactor",
        source: {},
        sourceArticles: [],
      },
    });

    expect(prompt.system).toContain("Write for the intended readership");
    expect(prompt.system).toContain("personal_readers");

    const parsedUser = JSON.parse(prompt.user);
    expect(parsedUser.business_context.industry).toBe("AI Development");
    expect(parsedUser.personal_brand_profile.founder_name).toBe("David Kim");
    expect(parsedUser.personal_brand_profile.personal_readers).toBe(
      "Staff engineers, principal engineers, engineering managers",
    );
    expect(parsedUser.profile_revision).toBe(4);
  });
});
