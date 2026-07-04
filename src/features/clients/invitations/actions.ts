"use server";

import { revalidatePath } from "next/cache";

import { acceptInvitation, createInvitation, revokeInvitation } from "./service";

export type InviteFormState = {
  error: string | null;
  success: string | null;
};

export async function createInvitationAction(
  clientId: string,
  _prevState: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const result = await createInvitation(clientId, {
    invitedEmail: formData.get("invitedEmail"),
    role: formData.get("role"),
  });

  if (!result.ok) {
    return { error: result.message, success: null };
  }

  revalidatePath(`/client/${clientId}/settings`);

  return { error: null, success: result.data.manualInstructions };
}

export async function revokeInvitationAction(
  clientId: string,
  inviteId: string,
) {
  await revokeInvitation(inviteId);
  revalidatePath(`/client/${clientId}/settings`);
}

export async function acceptInvitationAction(inviteId: string) {
  await acceptInvitation(inviteId);
  revalidatePath("/clients");
}
