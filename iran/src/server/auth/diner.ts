import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { db } from "@/server/db/client";
import {
  createDinerSession,
  revokeDinerSession,
  validateDinerSession,
} from "@/server/modules/diners/service";
import { DINER_COOKIE, dinerCookieOptions } from "./cookies";

/** The signed-in diner (customer account), memoized for one request. */
export const getCurrentDiner = cache(async () => {
  const token = (await cookies()).get(DINER_COOKIE)?.value;
  await connection();
  return (await validateDinerSession(db, token))?.diner ?? null;
});

/** Server actions only. */
export async function startDinerSession(dinerId: string) {
  const { token } = await createDinerSession(db, dinerId);
  (await cookies()).set(DINER_COOKIE, token, dinerCookieOptions);
}

export async function endDinerSession() {
  const jar = await cookies();
  await revokeDinerSession(db, jar.get(DINER_COOKIE)?.value);
  jar.delete(DINER_COOKIE);
}
