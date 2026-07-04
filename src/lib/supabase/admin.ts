import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

function getServiceRoleEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase admin client is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return { url, serviceRoleKey };
}

/**
 * Privileged Supabase client using the service role key. Bypasses RLS —
 * server-only, and guarded by the `server-only` import so bundling this
 * into a Client Component fails the build instead of leaking the key.
 *
 * Not used by any route yet; reserved for future worker/API features
 * that need trusted, cross-client access.
 */
export function createAdminClient() {
  const { url, serviceRoleKey } = getServiceRoleEnv();

  return createSupabaseClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
