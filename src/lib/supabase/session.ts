import "server-only";

import { shouldBlockForTemporaryPassword } from "@/lib/access/password-gate";

import { createClient } from "./server";

/**
 * Reads the current authenticated user, if any, for use in Server
 * Components, Route Handlers, and Server Actions. Uses `auth.getUser()` rather than
 * `auth.getSession()` because it revalidates the token with the Supabase
 * Auth server instead of trusting the cookie contents. By default it also
 * denies server work while the user must replace a temporary password; only
 * the dedicated password-change flow may opt out of that gate.
 *
 * This is a read helper only — it does not redirect or enforce access.
 * Route protection is implemented separately.
 */
export async function getServerUser(options?: {
  allowPasswordChangeRequired?: boolean;
}) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    return { user: null, error };
  }

  if (user) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", user.id)
      .maybeSingle<{ must_change_password: boolean }>();

    if (profileError) {
      return { user: null, error: profileError };
    }

    if (
      shouldBlockForTemporaryPassword({
        mustChangePassword: Boolean(profile?.must_change_password),
        allowPasswordChangeRequired: Boolean(
          options?.allowPasswordChangeRequired,
        ),
      })
    ) {
      return {
        user: null,
        error: new Error("PASSWORD_CHANGE_REQUIRED"),
      };
    }
  }

  return { user, error: null };
}
