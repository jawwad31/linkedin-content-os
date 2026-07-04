import "server-only";

import { createClient } from "./server";

/**
 * Reads the current authenticated user, if any, for use in Server
 * Components and Route Handlers. Uses `auth.getUser()` rather than
 * `auth.getSession()` because it revalidates the token with the Supabase
 * Auth server instead of trusting the cookie contents.
 *
 * This is a read helper only — it does not redirect or enforce access.
 * Route protection is implemented separately.
 */
export async function getServerUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    return { user: null, error };
  }

  return { user, error: null };
}
