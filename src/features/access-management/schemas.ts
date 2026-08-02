import { z } from "zod";

import { CLIENT_PERMISSIONS } from "@/lib/access/roles";

import { strongPasswordSchema } from "./password";

export const clientPermissionSchema = z.enum(CLIENT_PERMISSIONS);
export const accountRoleSchema = z.enum(["client_admin", "client_user"]);

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter an email address.")
  .email("Enter a valid email address.");

const displayNameSchema = z
  .string()
  .trim()
  .max(120, "Name must be 120 characters or fewer.")
  .optional()
  .transform((value) => value || undefined);

const optionalPasswordSchema = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined)
  .pipe(strongPasswordSchema.optional());

const permissionsSchema = z
  .array(clientPermissionSchema)
  .max(CLIENT_PERMISSIONS.length)
  .transform((permissions) => Array.from(new Set(permissions)));

export const provisionAccountUserSchema = z
  .object({
    email: emailSchema,
    name: displayNameSchema,
    temporaryPassword: optionalPasswordSchema,
    role: accountRoleSchema,
    permissions: permissionsSchema,
  })
  .superRefine((value, context) => {
    if (value.role === "client_user" && value.permissions.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["permissions"],
        message: "Select at least one Account User permission.",
      });
    }
    if (value.role === "client_admin" && value.permissions.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["permissions"],
        message: "Account Admins receive full access automatically.",
      });
    }
  });

export const provisionAgencyUserSchema = z
  .object({
    scope: z.enum(["agency", "account"]),
    clientId: z.string().uuid().optional(),
    email: emailSchema,
    name: displayNameSchema,
    temporaryPassword: optionalPasswordSchema,
    role: z.enum(["agency_admin", "client_admin", "client_user"]),
    permissions: permissionsSchema,
  })
  .superRefine((value, context) => {
    if (value.scope === "agency" && value.role !== "agency_admin") {
      context.addIssue({
        code: "custom",
        path: ["role"],
        message: "Agency scope requires the Agency Admin role.",
      });
    }
    if (value.scope === "account") {
      if (!value.clientId) {
        context.addIssue({
          code: "custom",
          path: ["clientId"],
          message: "Select an Account.",
        });
      }
      if (value.role === "agency_admin") {
        context.addIssue({
          code: "custom",
          path: ["role"],
          message: "Account scope requires an Account role.",
        });
      }
    }
    if (value.role === "client_user" && value.permissions.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["permissions"],
        message: "Select at least one Account User permission.",
      });
    }
    if (value.role !== "client_user" && value.permissions.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["permissions"],
        message: "Administrator roles receive full access automatically.",
      });
    }
  });

export const updateAccountMembershipSchema = z
  .object({
    role: accountRoleSchema,
    permissions: permissionsSchema,
  })
  .superRefine((value, context) => {
    if (value.role === "client_user" && value.permissions.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["permissions"],
        message: "Select at least one Account User permission.",
      });
    }
    if (value.role === "client_admin" && value.permissions.length > 0) {
      context.addIssue({
        code: "custom",
        path: ["permissions"],
        message: "Account Admins receive full access automatically.",
      });
    }
  });

export const resetPasswordSchema = z.object({
  temporaryPassword: strongPasswordSchema,
});

export const changePasswordSchema = z
  .object({
    password: strongPasswordSchema,
    confirmPassword: z.string(),
  })
  .superRefine((value, context) => {
    if (value.password !== value.confirmPassword) {
      context.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

export type ProvisionAccountUserInput = z.infer<
  typeof provisionAccountUserSchema
>;
export type ProvisionAgencyUserInput = z.infer<typeof provisionAgencyUserSchema>;
export type UpdateAccountMembershipInput = z.infer<
  typeof updateAccountMembershipSchema
>;
