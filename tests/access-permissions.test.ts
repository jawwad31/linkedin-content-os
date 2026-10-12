import { describe, expect, it } from "vitest";

import {
  CLIENT_PERMISSIONS,
  DEFAULT_CLIENT_USER_PERMISSIONS,
  canRoleContributeResearch,
  canRoleDraftPosts,
  canRoleManageFounderExperiences,
  canRoleManageIdeas,
  canRolePublishPosts,
  canRoleReviewPosts,
  hasClientPermission,
} from "@/lib/access/roles";

describe("Account access permissions", () => {
  it("grants every capability to an Account Admin without explicit permissions", () => {
    for (const permission of CLIENT_PERMISSIONS) {
      expect(hasClientPermission("client_admin", [], permission)).toBe(true);
    }
  });

  it("grants an Account User only the selected capabilities", () => {
    const permissions = ["ideas_manage", "posts_review"] as const;

    expect(canRoleManageIdeas("client_user", [...permissions])).toBe(true);
    expect(canRoleReviewPosts("client_user", [...permissions])).toBe(true);
    expect(canRoleContributeResearch("client_user", [...permissions])).toBe(false);
    expect(canRoleManageFounderExperiences("client_user", [...permissions])).toBe(false);
    expect(canRoleDraftPosts("client_user", [...permissions])).toBe(false);
    expect(canRolePublishPosts("client_user", [...permissions])).toBe(false);
  });

  it("preserves the legacy contributor capabilities during migration", () => {
    expect(DEFAULT_CLIENT_USER_PERMISSIONS).toEqual([
      "research_contribute",
      "founder_experience_manage",
      "ideas_manage",
      "posts_draft",
    ]);
    expect(canRoleReviewPosts("client_user", DEFAULT_CLIENT_USER_PERMISSIONS)).toBe(false);
    expect(canRolePublishPosts("client_user", DEFAULT_CLIENT_USER_PERMISSIONS)).toBe(false);
  });
});
