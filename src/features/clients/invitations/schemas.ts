import { z } from "zod";

export const clientRoleSchema = z.enum(["owner", "editor", "viewer"]);
export type ClientRole = z.infer<typeof clientRoleSchema>;

export const createInvitationSchema = z.object({
  invitedEmail: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, "Enter an email address.")
    .email("Enter a valid email address."),
  role: clientRoleSchema,
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
