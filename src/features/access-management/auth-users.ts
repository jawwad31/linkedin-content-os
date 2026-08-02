import "server-only";

import type { User } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

const USERS_PER_PAGE = 200;
const MAX_USER_PAGES = 100;

export async function findAuthUserByEmail(
  admin: AdminClient,
  email: string,
): Promise<{ user: User | null; error: boolean }> {
  const normalizedEmail = email.trim().toLowerCase();

  for (let page = 1; page <= MAX_USER_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: USERS_PER_PAGE,
    });

    if (error) return { user: null, error: true };

    const user = data.users.find(
      (candidate) => candidate.email?.trim().toLowerCase() === normalizedEmail,
    );
    if (user) return { user, error: false };
    if (data.nextPage === null) return { user: null, error: false };
  }

  return { user: null, error: true };
}

export async function getAuthUsersById(
  admin: AdminClient,
  userIds: readonly string[],
): Promise<Map<string, User>> {
  const remaining = new Set(userIds);
  const result = new Map<string, User>();
  if (remaining.size === 0) return result;

  for (let page = 1; page <= MAX_USER_PAGES; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: USERS_PER_PAGE,
    });
    if (error) return result;

    for (const user of data.users) {
      if (remaining.has(user.id)) {
        result.set(user.id, user);
        remaining.delete(user.id);
      }
    }

    if (remaining.size === 0 || data.nextPage === null) return result;
  }

  return result;
}
