import "server-only";

import { getAccessibleClients } from "@/features/clients/queries";

/**
 * Where a signed-in person lands. Everyone with exactly one company goes straight
 * into it; someone who belongs to several sees the Companies list
 * once, at /clients, and picks one. There is no workspace switcher inside a
 * company.
 */
export async function resolveAuthenticatedDestination(
  userId: string,
): Promise<string> {
  const result = await getAccessibleClients(userId);

  if (!result.ok) {
    return "/no-access";
  }

  if (result.clients.length === 1) {
    return `/client/${result.clients[0].id}/posts`;
  }

  if (result.clients.length > 1) {
    return "/clients";
  }

  return "/no-access";
}
