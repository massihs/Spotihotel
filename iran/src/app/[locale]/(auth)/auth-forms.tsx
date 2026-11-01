"use client";

import { KindPicker } from "@/components/kind-picker";
import { isRestaurantKind } from "@/lib/restaurant-kind";
import { useTranslations } from "next-intl";
import { useActionState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { loginAction, signupAction, type AuthFormState } from "./actions";

const noopSubscribe = () => () => {};

function FormError({ code }: { code?: AuthFormState["error"] }) {
  const t = useTranslations("auth.errors");
  if (!code) return null;
  return (
    <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
      {t(code)}
    </p>
  );
}

export function LoginForm() {
  const t = useTranslations("auth");
  const [state, action, pending] = useActionState(loginAction, {});
  // Post-login destination (?next=/…). Read on the client so the page stays fully static.
  const next = useSyncExternalStore(
    noopSubscribe,
    () => new URLSearchParams(window.location.search).get("next"),
    () => null,
  );
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError code={state.error} />
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field
        label={t("email")}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email}
      />
      <Field label={t("password")} name="password" type="password" autoComplete="current-password" required />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "…" : t("loginSubmit")}
      </Button>
    </form>
  );
}

export function SignupForm() {
  const t = useTranslations("auth");
  const te = useTranslations("auth.errors");
  const [state, action, pending] = useActionState(signupAction, {});
  const err = (k: string) => {
    const code = state.fieldErrors?.[k];
    return code ? te(code as "validation") : undefined;
  };
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormError code={state.error === "validation" ? undefined : state.error} />
      <Field
        label={t("restaurantName")}
        name="restaurantName"
        autoComplete="organization"
        required
        defaultValue={state.values?.restaurantName}
        error={err("restaurantName")}
      />
      <KindPicker defaultValue={isRestaurantKind(state.values?.kind) ? state.values.kind : "restaurant"} />
      <Field
        label={t("fullName")}
        name="fullName"
        autoComplete="name"
        required
        defaultValue={state.values?.fullName}
        error={err("fullName")}
      />
      <Field
        label={t("email")}
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        defaultValue={state.values?.email}
        error={err("email")}
      />
      <Field
        label={t("password")}
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={10}
        required
        hint={t("passwordHint")}
        error={err("password")}
      />
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "…" : t("signupSubmit")}
      </Button>
    </form>
  );
}
