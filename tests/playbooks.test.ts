import { describe, expect, it } from "vitest";

import {
  ALLOWED_PLAYBOOK_FILES,
  PLAYBOOK_MANIFEST,
} from "@/lib/ai/playbooks/manifest";
import {
  loadContentPlaybook,
  loadPlanningPlaybook,
  loadReviewPlaybook,
  resolvePlaybookPath,
  validatePlaybookManifest,
} from "@/lib/ai/playbooks/loader";
import { planFixture } from "./fixtures/generation-inputs";

describe("production playbook manifest", () => {
  it("loads every explicitly allowlisted Markdown file", async () => {
    await expect(validatePlaybookManifest()).resolves.toBeUndefined();
    expect(ALLOWED_PLAYBOOK_FILES.length).toBeGreaterThanOrEqual(15);
    expect(ALLOWED_PLAYBOOK_FILES.every((file) => file.endsWith(".md"))).toBe(true);
  });

  it("keeps the root developer router out of production prompts", () => {
    expect(ALLOWED_PLAYBOOK_FILES).not.toContain("SKILL.md");
  });

  it("rejects paths outside the allowlist", () => {
    expect(() => resolvePlaybookPath("../AGENTS.md")).toThrow(/not allowlisted/);
  });

  it("composes stage-specific resources", async () => {
    const planning = await loadPlanningPlaybook();
    const content = await loadContentPlaybook(planFixture);
    const review = await loadReviewPlaybook(planFixture);

    expect(planning).toContain("Content Strategy Method");
    expect(planning).toContain("Angle Types");
    expect(planning).toContain("post-structures.md#selection");
    expect(content).toContain("#mistake_lesson");
    expect(content).not.toContain("#bab");
    expect(review).toContain("Final QA and Format Recommendation");
    expect(review).not.toContain("Article Classification");
    expect(PLAYBOOK_MANIFEST.content).toContain(
      "resources/craft/linkedin-writing-guide.md",
    );
  });
});
