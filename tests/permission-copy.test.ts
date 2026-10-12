import { describe, expect, it } from "vitest";

import { cannotReason, missingPermissions } from "@/lib/access/permission-copy";

describe("cannotReason", () => {
  it("names one missing capability in the wireframe wording", () => {
    expect(cannotReason("draft posts", ["posts_draft"])).toBe(
      "You cannot draft posts. Ask an account admin to add the Draft posts capability.",
    );
  });

  it("names several missing capabilities in one line", () => {
    expect(cannotReason("create posts", ["ideas_manage", "posts_draft"])).toBe(
      "You cannot create posts. Ask an account admin to add the Manage ideas and Draft posts capabilities.",
    );
  });

  it("returns null when nothing is missing", () => {
    expect(cannotReason("draft posts", [])).toBeNull();
  });
});

describe("missingPermissions", () => {
  it("never reports a gap for an account admin", () => {
    expect(missingPermissions("client_admin", [], ["ideas_manage", "posts_draft"])).toEqual([]);
    expect(missingPermissions("agency_admin", [], ["posts_review"])).toEqual([]);
  });

  it("lists only the capabilities an account user lacks", () => {
    expect(missingPermissions("client_user", ["ideas_manage"], ["ideas_manage", "posts_draft"])).toEqual(["posts_draft"]);
  });
});
