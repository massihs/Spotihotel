"use client";

import { Mail, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  emailLoginAction,
  emailSignupAction,
  sendCodeAction,
  verifyCodeAction,
} from "@/app/[locale]/account/actions";

type Result = { ok: boolean; error?: string } | null | undefined;

/**
 * Diner sign-in: mobile number + SMS code, or e-mail + password (with sign-up).
 * `phoneOnly`: just the SMS flow, to add a verified number to a signed-in account.
 */
export function DinerLogin({ sms = true, phoneOnly = false }: { sms?: boolean; phoneOnly?: boolean }) {
  const t = useTranslations("account");
  const [tab, setTab] = useState<"phone" | "email">(sms ? "phone" : "email");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Phone flow
  const [phone, setPhone] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  // E-mail flow
  const [mode, setMode] = useState<"login" | "signup">("login");

  const handle = (fn: () => Promise<Result>, after?: (r: Result) => void) =>
    start(async () => {
      setError(null);
      const res = await fn();
      if (res && !res.ok) setError(res.error ?? "internal");
      else after?.(res);
    });
  const errorText = error
    ? t.has(`errors.${error}`)
      ? t(`errors.${error}` as "errors.internal")
      : t("errors.internal")
    : null;

  return (
    <div className="space-y-5">
      {!phoneOnly && sms ? (
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1" role="tablist">
          {(
            [
              ["phone", Smartphone, t("tabPhone")],
              ["email", Mail, t("tabEmail")],
            ] as const
          ).map(([id, Icon, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => {
                setTab(id);
                setError(null);
              }}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-colors",
                tab === id ? "bg-surface shadow-[var(--shadow-soft)]" : "text-fg-muted hover:text-fg",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {errorText ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          {errorText}
        </p>
      ) : null}

      {tab === "phone" ? (
        sentTo ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handle(() => verifyCodeAction(sentTo, code));
            }}
          >
            <p className="text-sm text-fg-muted">{t("codeSent", { phone: sentTo })}</p>
            <Field
              label={t("code")}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              dir="ltr"
              className="text-center text-2xl font-bold tracking-[0.5em]"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d۰-۹]/g, "").slice(0, 6))}
              autoFocus
            />
            <Button type="submit" size="lg" className="w-full" disabled={pending || code.length < 6}>
              {pending ? "…" : t("verify")}
            </Button>
            <div className="flex justify-between text-sm">
              <button
                type="button"
                className="font-medium text-fg-muted hover:text-fg"
                onClick={() => {
                  setSentTo(null);
                  setCode("");
                }}
              >
                {t("changeNumber")}
              </button>
              <button
                type="button"
                className="font-medium text-accent-text hover:underline"
                disabled={pending}
                onClick={() => handle(() => sendCodeAction(sentTo))}
              >
                {t("resend")}
              </button>
            </div>
          </form>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              handle(
                () => sendCodeAction(phone),
                (r) => {
                  const data = (r as { data?: { phone: string } } | null)?.data;
                  if (data) setSentTo(data.phone);
                },
              );
            }}
          >
            <Field
              label={t("mobile")}
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              placeholder="09xx xxx xxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <Button type="submit" size="lg" className="w-full" disabled={pending || phone.trim().length < 10}>
              {pending ? "…" : t("sendCode")}
            </Button>
          </form>
        )
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const email = String(fd.get("email") ?? "");
            const password = String(fd.get("password") ?? "");
            handle(() =>
              mode === "login"
                ? emailLoginAction(email, password)
                : emailSignupAction(String(fd.get("name") ?? ""), email, password),
            );
          }}
        >
          {mode === "signup" ? <Field label={t("name")} name="name" autoComplete="given-name" /> : null}
          <Field
            label={t("email")}
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            required
          />
          <Field
            label={t("password")}
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            hint={mode === "signup" ? t("passwordHint") : undefined}
            required
          />
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? "…" : mode === "login" ? t("login") : t("signup")}
          </Button>
          <p className="text-center text-sm text-fg-muted">
            {mode === "login" ? t("noAccount") : t("haveAccount")}{" "}
            <button
              type="button"
              className="font-medium text-accent-text hover:underline"
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setError(null);
              }}
            >
              {mode === "login" ? t("signup") : t("login")}
            </button>
          </p>
        </form>
      )}
    </div>
  );
}
