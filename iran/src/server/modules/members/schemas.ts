import { z } from "zod";
import { JOBS } from "@/lib/jobs";
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
  /** Job preset (sets the role and permissions); the role field is ignored when set. */
  job: z.enum(JOBS).optional(),
  stationId: z.uuid().nullable().optional(),
  /** The restaurant's own job (its base job wins over `job`). */
  teamJobId: z.uuid().nullable().optional(),
  /** Initial password, only used when the account does not exist yet. */
  password: passwordSchema.optional(),
});
export type AddMemberInput = z.input<typeof addMemberSchema>;

export const updateMemberSchema = z.object({
  role: assignableRole,
  grantedPermissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
  revokedPermissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
  status: z.enum(["active", "disabled"]),
  /** Keep the stored per-member permissions (their access comes from a section). */
  keepPermissions: z.boolean().optional(),
});
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

export const memberJobSchema = z.object({
  job: z.enum(JOBS).nullable(),
  stationId: z.uuid().nullable(),
  /** The restaurant's own job; its base job wins over `job`. */
  teamJobId: z.uuid().nullable().optional(),
});
export type MemberJobInput = z.infer<typeof memberJobSchema>;
