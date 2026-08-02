import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { generateTemporaryPassword, strongPasswordSchema } from "@/features/access-management/password";
import { canAccountAdminResetTarget } from "@/features/access-management/policy";
import { shouldBlockForTemporaryPassword } from "@/lib/access/password-gate";
import {
  provisionAccountUserSchema,
  provisionAgencyUserSchema,
  updateAccountMembershipSchema,
} from "@/features/access-management/schemas";

describe("manual user provisioning contracts", () => {
  it("requires at least one permission for an Account User", () => {
    const result = provisionAccountUserSchema.safeParse({
      email: "user@example.com",
      name: "Example User",
      temporaryPassword: "StrongPassword1!",
      role: "client_user",
      permissions: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects explicit permissions for an Account Admin", () => {
    const result = updateAccountMembershipSchema.safeParse({
      role: "client_admin",
      permissions: ["posts_publish"],
    });
    expect(result.success).toBe(false);
  });

  it("requires an Account selection for Account-scoped Agency provisioning", () => {
    const result = provisionAgencyUserSchema.safeParse({
      scope: "account",
      email: "user@example.com",
      temporaryPassword: "StrongPassword1!",
      role: "client_user",
      permissions: ["posts_draft"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts Agency Admin provisioning without Account permissions", () => {
    const result = provisionAgencyUserSchema.safeParse({
      scope: "agency",
      email: "admin@example.com",
      temporaryPassword: "StrongPassword1!",
      role: "agency_admin",
      permissions: [],
    });
    expect(result.success).toBe(true);
  });

  it("generates strong temporary passwords", () => {
    for (let index = 0; index < 25; index += 1) {
      expect(strongPasswordSchema.safeParse(generateTemporaryPassword()).success).toBe(true);
    }
  });
});

describe("Account Admin password reset boundary", () => {
  it("allows reset when the target belongs only to the managed Account", () => {
    expect(
      canAccountAdminResetTarget({
        managedClientId: "account-a",
        acceptedClientIds: ["account-a"],
        hasAcceptedAgencyMembership: false,
      }),
    ).toBe(true);
  });

  it("blocks targets with Agency or another Account access", () => {
    expect(
      canAccountAdminResetTarget({
        managedClientId: "account-a",
        acceptedClientIds: ["account-a", "account-b"],
        hasAcceptedAgencyMembership: false,
      }),
    ).toBe(false);
    expect(
      canAccountAdminResetTarget({
        managedClientId: "account-a",
        acceptedClientIds: ["account-a"],
        hasAcceptedAgencyMembership: true,
      }),
    ).toBe(false);
  });
});

describe("temporary-password gate", () => {
  it("blocks normal server work but permits the dedicated password-change flow", () => {
    expect(
      shouldBlockForTemporaryPassword({
        mustChangePassword: true,
        allowPasswordChangeRequired: false,
      }),
    ).toBe(true);
    expect(
      shouldBlockForTemporaryPassword({
        mustChangePassword: true,
        allowPasswordChangeRequired: true,
      }),
    ).toBe(false);
  });
});

describe("permission migration", () => {
  const migrationPath = fileURLToPath(
    new URL(
      "../supabase/migrations/20260731215424_manual_user_provisioning_and_permissions.sql",
      import.meta.url,
    ),
  );
  const sql = readFileSync(migrationPath, "utf8");

  it("retires pending email claims and adds the first-login gate", () => {
    expect(sql).toContain("where invitation_status = 'pending'");
    expect(sql).toContain("update public.agency_members");
    expect(sql).toContain("alter column invitation_status set default 'accepted'");
    expect(sql).toContain("must_change_password boolean not null default false");
    expect(sql).toContain("protect_profile_security_fields");
  });

  it("uses a private permission helper and stage-specific write policies", () => {
    expect(sql).toContain("private.has_client_permission");
    expect(sql).toContain("'research_contribute'");
    expect(sql).toContain("'founder_experience_manage'");
    expect(sql).toContain("'ideas_manage'");
    expect(sql).toContain("'posts_draft'");
    expect(sql).toContain("'posts_review'");
    expect(sql).toContain("'posts_publish'");
    expect(sql).toContain("entry_type = 'trend_reaction'");
  });
});
