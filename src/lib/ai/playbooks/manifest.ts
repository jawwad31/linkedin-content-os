export const PLAYBOOK_STAGES = [
  "research-classification",
  "research-synthesis",
  "planning",
  "content",
  "review",
] as const;

export type PlaybookStage = (typeof PLAYBOOK_STAGES)[number];

export const PLAYBOOK_MANIFEST: Record<PlaybookStage, readonly string[]> = {
  "research-classification": [
    ".agents/skills/research/SKILL.md",
    "resources/context/business-context.md",
    "resources/principles/source-proof-safety.md",
    "resources/research/article-classification.md",
  ],
  "research-synthesis": [
    ".agents/skills/research/SKILL.md",
    "resources/context/business-context.md",
    "resources/principles/source-proof-safety.md",
    "resources/research/trend-card-synthesis.md",
  ],
  planning: [
    ".agents/skills/planning/SKILL.md",
    "resources/context/business-context.md",
    "resources/principles/icp-first-content.md",
    "resources/principles/source-proof-safety.md",
    "resources/strategy/content-strategy.md",
    "resources/strategy/angle-types.md",
  ],
  content: [
    ".agents/skills/content/SKILL.md",
    "resources/principles/icp-first-content.md",
    "resources/principles/source-proof-safety.md",
    "resources/strategy/content-strategy.md",
    "resources/craft/linkedin-writing-guide.md",
  ],
  review: [
    ".agents/skills/review/SKILL.md",
    "resources/principles/icp-first-content.md",
    "resources/principles/source-proof-safety.md",
    "resources/craft/linkedin-writing-guide.md",
    "resources/quality/final-qa.md",
  ],
};

export const SECTIONED_PLAYBOOK_FILES = [
  "resources/strategy/post-structures.md",
  "resources/craft/hooks.md",
  "resources/craft/body-frameworks.md",
  "resources/craft/cta.md",
] as const;

export const ALLOWED_PLAYBOOK_FILES = [
  ...new Set([
    ...Object.values(PLAYBOOK_MANIFEST).flat(),
    ...SECTIONED_PLAYBOOK_FILES,
  ]),
] as const;
