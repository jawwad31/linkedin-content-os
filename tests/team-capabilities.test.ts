import { describe, expect, it } from "vitest";

import { teamCapabilityLabels } from "@/features/access-management/team-capabilities";

describe("teamCapabilityLabels", () => {
  it("shows an Account Admin as holding every capability, whatever is stored", () => {
    expect(teamCapabilityLabels("client_admin", [])).toEqual(["All capabilities"]);
    expect(teamCapabilityLabels("client_admin", ["posts_publish"])).toEqual(["All capabilities"]);
  });

  it("lists the selected capabilities of an Account User with the wireframe names", () => {
    expect(teamCapabilityLabels("client_user", ["ideas_manage", "posts_draft"])).toEqual([
      "Manage ideas",
      "Draft posts",
    ]);
  });

  it("returns no labels for an Account User with no capabilities", () => {
    expect(teamCapabilityLabels("client_user", [])).toEqual([]);
  });
});
