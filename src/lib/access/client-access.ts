import "server-only";

import { z } from "zod";

import { getCurrentUserRoleForClient } from "@/features/clients/invitations/queries";
import type { ClientRole } from "@/features/clients/invitations/schemas";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/session";

const uuidSchema = z.string().uuid();

export type ClientShellAccess =
  | { ok: true; clientId: string; clientName: string; role: ClientRole }
  | { ok: false };

type ClientRow = { id: string; name: string };

/**
 * The sole app-level per-client authorization gate. src/proxy.ts only
 * checks that a user is authenticated — it has no awareness of client_id —
 * so this is what actually decides whether a client-scoped page (and any
 * client-specific data like its name) is shown at all. RLS is the backstop
 * that prevents data leakage if this check ever had a bug, not a substitute
 * for it.
 *
 * Callers should treat `{ ok: false }` as "not found" (call notFound()),
 * not "forbidden": Next.js has no stable built-in 403 primitive, and
 * returning 404 avoids confirming or denying whether a given client_id
 * exists at all to a user without access to it.
 */
export async function getClientShellAccess(
  clientId: string,
): Promise<ClientShellAccess> {
  const clientIdResult = uuidSchema.safeParse(clientId);
  if (!clientIdResult.success) return { ok: false };

  const { user } = await getServerUser();
  if (!user) return { ok: false };

  const role = await getCurrentUserRoleForClient(user.id, clientIdResult.data);
  if (!role) return { ok: false };

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("clients")
    .select("id, name")
    .eq("id", clientIdResult.data)
    .is("deleted_at", null)
    .maybeSingle<ClientRow>();

  if (error || !data) return { ok: false };

  return {
    ok: true,
    clientId: data.id,
    clientName: data.name,
    role,
  };
}
