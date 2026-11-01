import { z } from "zod";
import { PERMISSIONS } from "@/server/auth/permissions";
import { emailSchema, passwordSchema } from "@/server/modules/auth/schemas";

export const assignableRole = z.enum(["admin", "staff"]);

export const addMemberSchema = z.object({
  email: emailSchema,
  /** Only used (and required) when the account does not exist yet. */
  fullName: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((v) => (v ? v : undefined)),
  role: assignableRole,
  /** Initial password, only used when the account does not exist yet. */
  password: passwordSchema.optional(),
});
export type AddMemberInput = z.input<typeof addMemberSchema>;

export const updateMemberSchema = z.object({
  role: assignableRole,
  grantedPermissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
  revokedPermissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
  status: z.enum(["active", "disabled"]),
});
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
