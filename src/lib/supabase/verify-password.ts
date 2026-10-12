import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { getSupabasePublicEnv } from "./env";

/**
 * Checks an email and password pair against Supabase Auth without touching the
 * signed-in session: the client keeps nothing and refreshes nothing. Used to ask
 * for the current password before it is changed.
 */
export async function verifyPassword(
  email: string,
  password: string,
): Promise<boolean> {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } =
    getSupabasePublicEnv();
  const checker = createSupabaseClient(
    NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await checker.auth.signInWithPassword({
    email,
    password,
  });
  return !error && Boolean(data.user);
}
