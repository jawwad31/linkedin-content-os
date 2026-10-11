export const SOURCE_MODES = [
  "founder_experience",
  "trend_card",
  "trend_reaction",
  "content_resource",
  "profile_led",
  "custom_upload",
  "research_brief",
] as const;

export const ALLOCATION_BUCKETS = [
  "experience",
  "asset",
  "evergreen",
  "news",
] as const;

export const FUNNEL_STAGES = [
  "Discovery",
  "Depth",
  "Authority",
  "Commercial",
] as const;

export const POST_TYPES = [
  "framework",
  "case_study",
  "contrarian_take",
  "how_to",
  "teardown",
  "listicle",
  "story",
  "lead_magnet_offer",
] as const;

export const ANGLE_TYPES = [
  "diagnostic",
  "myth_correction",
  "framework",
  "checklist",
  "process_breakdown",
  "before_after",
  "mistake_lesson",
  "objection_handling",
  "cost_of_inaction",
  "decision_criteria",
  "comparison",
  "case_example",
  "trend_take",
  "operator_pov",
  "faq_answer",
] as const;

export const CONTENT_ARCHETYPES = [
  "narrative_insight",
  "framework_post",
  "behind_the_build",
  "contrarian_take",
  "data_backed_observation",
  "resource_post",
] as const;

export const POST_STRUCTURES = [
  "comprehensive_breakdown",
  "listicle",
  "case_study_before_after",
  "conversational_story",
] as const;

export const BODY_FRAMEWORKS = [
  "aida",
  "pas",
  "bab",
  "mistake_lesson",
  "contrarian_reframe",
  "one_thing",
] as const;

export const HOOK_TYPES = [
  "declarative_pov",
  "diagnostic",
  "belief_crack",
  "specific_result",
  "before_after",
  "direct_address",
  "stakes",
] as const;

export const CTA_TYPES = [
  "diagnostic_close",
  "pov_close",
  "specific_question",
  "utility_close",
  "open_door",
  "comment_gate",
  "none",
] as const;

export const RESOURCE_TYPES = [
  "guide",
  "template",
  "checklist",
  "framework",
  "report",
  "worksheet",
  "tool",
  "other",
] as const;

export const RECOMMENDED_FORMATS = [
  "text",
  "carousel",
  "video",
  "poll",
  "newsletter",
] as const;

export const CREDIBILITY_BASES = [
  "founder_experience",
  "approved_proof",
  "positioning",
  "market_signal",
  "combined",
] as const;

export const CREDIBILITY_STRENGTHS = [
  "strong",
  "moderate",
  "limited",
] as const;

export type SourceMode = (typeof SOURCE_MODES)[number];
export type AllocationBucket = (typeof ALLOCATION_BUCKETS)[number];
export type FunnelStage = (typeof FUNNEL_STAGES)[number];
export type PostType = (typeof POST_TYPES)[number];
export type AngleType = (typeof ANGLE_TYPES)[number];
export type ContentArchetype = (typeof CONTENT_ARCHETYPES)[number];
export type PostStructure = (typeof POST_STRUCTURES)[number];
export type BodyFramework = (typeof BODY_FRAMEWORKS)[number];
export type HookType = (typeof HOOK_TYPES)[number];
export type CtaType = (typeof CTA_TYPES)[number];
export type ResourceType = (typeof RESOURCE_TYPES)[number];
export type RecommendedFormat = (typeof RECOMMENDED_FORMATS)[number];
export type CredibilityBasis = (typeof CREDIBILITY_BASES)[number];
export type CredibilityStrength = (typeof CREDIBILITY_STRENGTHS)[number];
