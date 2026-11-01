"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db/client";
import { endSession, requestMeta, startSession } from "@/server/auth/current";
import { recordAudit } from "@/server/audit";
import { isAppError } from "@/server/errors";
import { enforceRateLimit } from "@/server/infra/rate-limit";
import { loginSchema, signupSchema } from "@/server/modules/auth/schemas";
import { authenticate, registerOwner } from "@/server/modules/auth/service";

/** Actions return error *codes*; the client translates them. */
export type AuthFormState = {
  error?: "invalid_credentials" | "email_taken" | "rate_limited" | "validation" | "unknown";
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message === "password_too_short" ? "password_too_short" : "validation";
  }
  return out;
}

/** Only allow same-origin relative redirects. */
function safeNext(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

export async function loginAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = {
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
  };
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success)
    return { error: "validation", fieldErrors: fieldErrors(parsed.error), values: { email: raw.email } };

  const { ip } = await requestMeta();
  try {
    await enforceRateLimit("login", `${ip ?? "unknown"}:${parsed.data.email}`);
  } catch (e) {
    if (isAppError(e) && e.code === "RATE_LIMITED")
      return { error: "rate_limited", values: { email: raw.email } };
    throw e;
  }

  const user = await authenticate(db, parsed.data);
  if (!user) {
    await recordAudit(db, { action: "auth.login_failed", metadata: { email: parsed.data.email }, ip });
    return { error: "invalid_credentials", values: { email: raw.email } };
  }

  await startSession(user.id);
  await recordAudit(db, { action: "auth.login", actorUserId: user.id, ip });
  redirect(safeNext(formData.get("next")) ?? (user.isSuperAdmin ? "/admin" : "/dashboard"));
}

export async function signupAction(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = {
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    restaurantName: String(formData.get("restaurantName") ?? ""),
  };
  const { password: _pw, ...safeValues } = raw;
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success)
    return { error: "validation", fieldErrors: fieldErrors(parsed.error), values: safeValues };

  const { ip } = await requestMeta();
  let restaurantId: string;
  try {
    await enforceRateLimit("signup", ip ?? "unknown");
    const result = await registerOwner(db, parsed.data, { ip });
    await startSession(result.user.id);
    restaurantId = result.restaurant.id;
  } catch (e) {
    if (isAppError(e) && e.code === "RATE_LIMITED") return { error: "rate_limited", values: safeValues };
    if (isAppError(e) && e.code === "CONFLICT")
      return { error: "email_taken", fieldErrors: { email: "email_taken" }, values: safeValues };
    console.error("[signup] failed", e);
    return { error: "unknown", values: safeValues };
  }
  redirect(`/dashboard/${restaurantId}`);
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}
