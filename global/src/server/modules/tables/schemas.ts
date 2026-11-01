import { z } from "zod";

const optionalInt = (min: number, max: number) => z.number().int().min(min).max(max).nullable().optional();

export const tableSchema = z.object({
  label: z.string().trim().min(1).max(48),
  number: optionalInt(0, 99_999),
  capacity: optionalInt(1, 100),
  zone: z
    .string()
    .trim()
    .max(64)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
});
export type TableInput = z.infer<typeof tableSchema>;

export const MAX_BULK_TABLES = 200;

export const bulkTablesSchema = z
  .object({
    from: z.number().int().min(0).max(99_999),
    to: z.number().int().min(0).max(99_999),
    /** Optional label prefix: "T" → T1, T2… ; empty → 1, 2… */
    prefix: z.string().trim().max(24).default(""),
    capacity: optionalInt(1, 100),
    zone: z
      .string()
      .trim()
      .max(64)
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
  })
  .refine((v) => v.to >= v.from, { message: "invalid_range", path: ["to"] })
  .refine((v) => v.to - v.from + 1 <= MAX_BULK_TABLES, { message: "range_too_large", path: ["to"] });
export type BulkTablesInput = z.input<typeof bulkTablesSchema>;
