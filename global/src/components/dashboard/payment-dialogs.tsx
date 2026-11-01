"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  cancelPendingPaymentAction,
  recordPaymentAction,
  refundAction,
} from "@/app/[locale]/dashboard/[restaurantId]/payments/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/input";
import {
  ActionForm,
  FormFeedback,
  SubmitButton,
  TextareaField,
  useActionForm,
  useCloseOnSuccess,
  useFieldError,
} from "@/components/ui/form";
import { parseMoney } from "@/lib/money";
import { cn } from "@/lib/cn";

const newKey = () => crypto.randomUUID().replaceAll("-", "");

function useMoney(currency: string) {
  const format = useFormatter();
  return (c: number) => format.number(c / 100, { style: "currency", currency });
}

/** Staff collects cash or a card-terminal payment for one guest or the whole table. */
function CollectForm({
  restaurantId,
  tableSessionId,
  participantId,
  amountCents,
  currency,
  methods,
}: {
  restaurantId: string;
  tableSessionId: string;
  participantId: string | null;
  amountCents: number;
  currency: string;
  methods: string[];
}) {
  const t = useTranslations();
  const money = useMoney(currency);
  const [key] = useState(newKey);
  const [provider, setProvider] = useState(methods[0] ?? "cash");
  const [tendered, setTendered] = useState("");
  const form = useActionForm(recordPaymentAction.bind(null, restaurantId));
  const err = useFieldError(form.state);
  useCloseOnSuccess(form.state);
  const tenderedCents = tendered ? parseMoney(tendered) : null;
  const change = tenderedCents !== null ? tenderedCents - amountCents : null;

  return (
    <ActionForm form={form} className="space-y-4">
      <FormFeedback state={form.state} />
      <input type="hidden" name="tableSessionId" value={tableSessionId} />
      {participantId ? <input type="hidden" name="participantId" value={participantId} /> : null}
      <input type="hidden" name="idempotencyKey" value={key} />
      <p className="text-center text-3xl font-semibold tabular-nums">{money(amountCents)}</p>
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t("payments.method")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {methods.map((m) => (
            <label
              key={m}
              className={cn(
                "flex h-12 cursor-pointer items-center justify-center rounded-xl border text-sm font-medium",
                provider === m ? "border-accent bg-accent-soft text-accent" : "border-border",
              )}
            >
              <input
                type="radio"
                name="provider"
                value={m}
                checked={provider === m}
                onChange={() => setProvider(m)}
                className="sr-only"
              />
              {t(`payments.provider.${m}`)}
            </label>
          ))}
        </div>
      </fieldset>
      {provider === "cash" ? (
        <div>
          <Field
            label={t("payments.tendered")}
            name="tendered"
            inputMode="decimal"
            autoComplete="off"
            value={tendered}
            onChange={(e) => setTendered(e.target.value)}
            error={err("tendered")}
            hint={t("payments.tenderedHint")}
          />
          {change !== null && change >= 0 ? (
            <p
              className="mt-2 rounded-xl bg-success-soft px-3 py-2 text-sm font-semibold text-success"
              role="status"
            >
              {t("payments.change", { amount: money(change) })}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="flex justify-end">
        <SubmitButton>{t("payments.confirmCollected")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function CollectPaymentDialog(props: {
  restaurantId: string;
  tableSessionId: string;
  participantId: string | null;
  amountCents: number;
  currency: string;
  methods: string[];
  title: string;
  variant?: "primary" | "secondary";
  size?: "sm" | "md";
}) {
  const t = useTranslations("payments");
  const { title, variant = "primary", size = "sm", ...rest } = props;
  if (props.methods.length === 0) return null;
  return (
    <Dialog
      title={title}
      trigger={(open) => (
        <Button variant={variant} size={size} onClick={open}>
          {t("collect")}
        </Button>
      )}
    >
      <CollectForm {...rest} />
    </Dialog>
  );
}

function RefundForm({
  restaurantId,
  paymentId,
  refundableCents,
  currency,
}: {
  restaurantId: string;
  paymentId: string;
  refundableCents: number;
  currency: string;
}) {
  const t = useTranslations();
  const money = useMoney(currency);
  const form = useActionForm(refundAction.bind(null, restaurantId, paymentId));
  const err = useFieldError(form.state);
  useCloseOnSuccess(form.state);
  return (
    <ActionForm form={form} className="space-y-4">
      <FormFeedback state={form.state} />
      <p className="text-sm text-fg-muted">{t("payments.refundable", { amount: money(refundableCents) })}</p>
      <Field
        label={t("payments.refundAmount")}
        name="amount"
        inputMode="decimal"
        required
        defaultValue={(refundableCents / 100).toFixed(2)}
        error={err("amount")}
      />
      <TextareaField label={t("payments.refundReason")} name="reason" maxLength={500} />
      <div className="flex justify-end">
        <SubmitButton variant="danger">{t("payments.refund")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function RefundDialog(props: {
  restaurantId: string;
  paymentId: string;
  refundableCents: number;
  currency: string;
}) {
  const t = useTranslations("payments");
  return (
    <Dialog
      title={t("refundTitle")}
      trigger={(open) => (
        <Button variant="ghost" size="sm" onClick={open}>
          {t("refund")}
        </Button>
      )}
    >
      <RefundForm {...props} />
    </Dialog>
  );
}

export function CancelPendingButton({
  restaurantId,
  paymentId,
}: {
  restaurantId: string;
  paymentId: string;
}) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(t("payments.cancelPendingConfirm"))) return;
          startTransition(async () => {
            const res = await cancelPendingPaymentAction(restaurantId, paymentId);
            if (res?.ok === false)
              setError(
                t.has(`errorCodes.${res.error}`) ? t(`errorCodes.${res.error}`) : t("errorCodes.internal"),
              );
          });
        }}
      >
        {t("payments.cancelPending")}
      </Button>
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
