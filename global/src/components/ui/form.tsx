"use client";

import { useTranslations } from "next-intl";
import {
  createContext,
  startTransition,
  use,
  useActionState,
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type FormHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { useFormStatus } from "react-dom";
import { cn } from "@/lib/cn";
import { Button, type ButtonVariant } from "./button";
import { useDialog } from "./dialog";

export type ActionState =
  | { ok: true; at: number; data?: unknown }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; at: number }
  | null;

const PendingContext = createContext<boolean | null>(null);

/**
 * `useActionState` wired for forms that must keep the user's input when an action fails.
 * React 19 resets `<form action>` after every submission; this submits through a transition
 * instead, and only resets (optionally) on success.
 */
export function useActionForm(
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>,
  opts: { resetOnSuccess?: boolean } = {},
) {
  const [state, dispatch, pending] = useActionState(action, null);
  const lastForm = useRef<HTMLFormElement | null>(null);
  const { resetOnSuccess } = opts;
  useEffect(() => {
    if (resetOnSuccess && state?.ok) lastForm.current?.reset();
  }, [state, resetOnSuccess]);
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    lastForm.current = e.currentTarget;
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => dispatch(fd));
  };
  return { state, pending, onSubmit };
}

export function ActionForm({
  form,
  children,
  ...props
}: Omit<FormHTMLAttributes<HTMLFormElement>, "onSubmit" | "action"> & {
  form: ReturnType<typeof useActionForm>;
}) {
  return (
    <PendingContext value={form.pending}>
      <form onSubmit={form.onSubmit} {...props}>
        {children}
      </form>
    </PendingContext>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  className,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
}) {
  const status = useFormStatus();
  const ctxPending = use(PendingContext);
  const pending = ctxPending ?? status.pending;
  return (
    <Button type="submit" variant={variant} disabled={pending} aria-busy={pending} className={className}>
      {pending ? (
        <span
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : null}
      {children}
    </Button>
  );
}

/** Translated error / success banner for an action result. */
export function FormFeedback({ state, success }: { state: ActionState; success?: ReactNode }) {
  const t = useTranslations();
  if (!state) return null;
  if (state.ok) {
    return success ? (
      <p role="status" className="rounded-xl bg-success-soft px-3.5 py-2.5 text-sm text-success">
        {success}
      </p>
    ) : null;
  }
  // Field-level errors are shown next to their field; the banner stays generic.
  const hasFieldErrors = Object.keys(state.fieldErrors ?? {}).length > 0;
  const key = hasFieldErrors ? "errorCodes.validation" : `errorCodes.${state.error}`;
  return (
    <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
      {t.has(key) ? t(key) : t("errorCodes.internal")}
    </p>
  );
}

/** Translate a field error code, if any. */
export function useFieldError(state: ActionState) {
  const t = useTranslations("errorCodes");
  return (field: string) => {
    if (!state || state.ok) return undefined;
    const code = state.fieldErrors?.[field];
    if (!code) return undefined;
    return t.has(code) ? t(code) : t("invalid");
  };
}

/** Closes the enclosing <Dialog> when an action succeeds. */
export function useCloseOnSuccess(state: ActionState) {
  const dialog = useDialog();
  useEffect(() => {
    if (state?.ok) dialog?.close();
  }, [state, dialog]);
}

const controlClasses =
  "w-full rounded-xl border border-border bg-surface px-3.5 text-[15px] text-fg transition-colors hover:border-border-strong focus-visible:border-accent focus-visible:ring-4 focus-visible:ring-[var(--ring)] focus-visible:outline-none aria-invalid:border-danger";

function Wrapper({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SelectField({
  label,
  hint,
  error,
  children,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: ReactNode; hint?: ReactNode; error?: ReactNode }) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} hint={hint} error={error}>
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(controlClasses, "h-11", className)}
        {...props}
      >
        {children}
      </select>
    </Wrapper>
  );
}

export function TextareaField({
  label,
  hint,
  error,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: ReactNode; hint?: ReactNode; error?: ReactNode }) {
  const id = useId();
  return (
    <Wrapper id={id} label={label} hint={hint} error={error}>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={cn(controlClasses, "min-h-24 py-2.5", className)}
        {...props}
      />
    </Wrapper>
  );
}

export function Checkbox({
  label,
  description,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2.5 text-sm", className)}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" {...props} />
      <span>
        <span className="font-medium">{label}</span>
        {description ? <span className="block text-fg-muted">{description}</span> : null}
      </span>
    </label>
  );
}

/** A one-button form that asks for confirmation before submitting a server action. */
export function ConfirmActionButton({
  action,
  fields,
  confirm,
  children,
  variant = "ghost",
  className,
}: {
  action: (formData: FormData) => void | Promise<void>;
  fields: Record<string, string>;
  confirm?: string;
  children: ReactNode;
  variant?: ButtonVariant;
  className?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton variant={variant} className={className}>
        {children}
      </SubmitButton>
    </form>
  );
}
