import { hash, verify } from "@node-rs/argon2";

// OWASP 2024 recommended Argon2id parameters (m=19 MiB, t=2, p=1).
const OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export const PASSWORD_MIN_LENGTH = 10;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

/** Constant-ish time work for unknown accounts, to avoid user enumeration via timing. */
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$nTOn/6snIbEkDOoGDHVMxQ$J51UdiM5PngKdn7jzcIgkk/h7DnaB+6zgx6rH5L4RFc";
export async function burnPasswordCheck(plain: string): Promise<void> {
  await verifyPassword(DUMMY_HASH, plain);
}
