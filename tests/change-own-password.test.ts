import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: "user-1", email: "me@example.test" } as { id: string; email: string } | null,
  currentIsRight: true,
  updateError: null as { message: string } | null,
  updateUser: vi.fn(),
  profileUpdate: vi.fn(),
  audit: vi.fn(),
  verify: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/session", () => ({
  getServerUser: vi.fn(async () => ({ user: state.user })),
}));
vi.mock("@/lib/supabase/verify-password", () => ({
  verifyPassword: (...args: unknown[]) => {
    state.verify(...args);
    return Promise.resolve(state.currentIsRight);
  },
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      updateUser: (...args: unknown[]) => {
        state.updateUser(...args);
        return Promise.resolve({ error: state.updateError });
      },
    },
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (values: unknown) => {
        state.profileUpdate(values);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  }),
}));
vi.mock("@/lib/audit/log", () => ({
  writeAuditLog: (...args: unknown[]) => {
    state.audit(...args);
    return Promise.resolve();
  },
}));

import { AccountPasswordForm } from "@/features/access-management/account-password-form";
import { changeOwnPasswordWithCurrentSchema } from "@/features/access-management/schemas";
import { changeOwnPasswordWithCurrent } from "@/features/access-management/service";

const GOOD = {
  currentPassword: "OldPassword1!x",
  password: "NewPassword2@yy",
  confirmPassword: "NewPassword2@yy",
};

beforeEach(() => {
  state.user = { id: "user-1", email: "me@example.test" };
  state.currentIsRight = true;
  state.updateError = null;
  state.updateUser.mockClear();
  state.profileUpdate.mockClear();
  state.audit.mockClear();
  state.verify.mockClear();
});

describe("changing your own password (later, knowing the current one)", () => {
  it("checks the current password, then sets the new one, then records it", async () => {
    const result = await changeOwnPasswordWithCurrent(GOOD);
    expect(result.ok).toBe(true);
    expect(state.verify).toHaveBeenCalledWith("me@example.test", GOOD.currentPassword);
    expect(state.updateUser).toHaveBeenCalledWith({ password: GOOD.password });
    expect(state.profileUpdate).toHaveBeenCalledTimes(1);
    expect(state.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "password_changed", userId: "user-1" }),
    );
  });

  it("changes nothing when the current password is wrong", async () => {
    state.currentIsRight = false;
    const result = await changeOwnPasswordWithCurrent(GOOD);
    expect(result).toMatchObject({ ok: false, message: "Your current password is not correct." });
    expect(state.updateUser).not.toHaveBeenCalled();
    expect(state.profileUpdate).not.toHaveBeenCalled();
    expect(state.audit).not.toHaveBeenCalled();
  });

  it("refuses when nobody is signed in, without checking anything", async () => {
    state.user = null;
    expect((await changeOwnPasswordWithCurrent(GOOD)).ok).toBe(false);
    expect(state.verify).not.toHaveBeenCalled();
    expect(state.updateUser).not.toHaveBeenCalled();
  });

  it("reports a refusal from the auth service and does not record a change", async () => {
    state.updateError = { message: "weak" };
    const result = await changeOwnPasswordWithCurrent(GOOD);
    expect(result.ok).toBe(false);
    expect(state.audit).not.toHaveBeenCalled();
  });

  it("rejects weak, mismatched and unchanged passwords before any check", async () => {
    for (const bad of [
      { ...GOOD, password: "short", confirmPassword: "short" },
      { ...GOOD, confirmPassword: "Different3#zzzz" },
      { ...GOOD, password: GOOD.currentPassword, confirmPassword: GOOD.currentPassword },
      { ...GOOD, currentPassword: "" },
    ]) {
      expect(changeOwnPasswordWithCurrentSchema.safeParse(bad).success).toBe(false);
      expect((await changeOwnPasswordWithCurrent(bad)).ok).toBe(false);
    }
    expect(state.verify).not.toHaveBeenCalled();
    expect(state.updateUser).not.toHaveBeenCalled();
  });
});

describe("change password form", () => {
  it("asks for the current password, the new one and a confirmation", () => {
    const html = renderToStaticMarkup(createElement(AccountPasswordForm));
    expect(html).toContain("Current password");
    expect(html).toContain("New password");
    expect(html).toContain("Confirm new password");
    expect(html).toContain('autoComplete="current-password"');
    expect(html.match(/type="password"/g)).toHaveLength(3);
    expect(html).toContain("Change password");
  });
});
