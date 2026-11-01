"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { spinWheelAction, submitFeedbackAction } from "./actions";

/** Labels follow their slice but never read upside down. */
const upright = (deg: number) => (deg > 90 && deg < 270 ? deg + 180 : deg);

const COLORS = ["#7c5cff", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16", "#f97316"];

/** Rate 1–5 (+ comment), then, when the restaurant has a wheel, one spin for a coupon. */
export function FeedbackForm({
  token,
  initialRating,
  wheel,
  initialPrize,
}: {
  token: string;
  initialRating: number | null;
  wheel: string[] | null;
  initialPrize: { label: string | null; couponCode: string | null } | null;
}) {
  const t = useTranslations("feedbackPage");
  const te = useTranslations();
  const [rating, setRating] = useState(initialRating ?? 0);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(initialRating != null);
  const [prize, setPrize] = useState(initialPrize);
  const [turn, setTurn] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const fail = (code: string) =>
    setError(te.has(`errorCodes.${code}`) ? te(`errorCodes.${code}`) : te("errorCodes.internal"));

  if (!sent)
    return (
      <div className="space-y-5">
        <div className="flex justify-center gap-2" role="radiogroup" aria-label={t("rate")}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={t("stars", { count: n })}
              onClick={() => setRating(n)}
              className="p-1 transition-transform active:scale-90"
            >
              <Star
                className={cn("size-10", n <= rating ? "fill-warning text-warning" : "text-border-strong")}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
        {rating > 0 ? <p className="text-center text-sm font-semibold">{t(`label${rating}`)}</p> : null}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.currentTarget.value)}
          maxLength={1000}
          rows={3}
          placeholder={rating && rating <= 2 ? t("whatWrong") : t("commentPlaceholder")}
          className="w-full rounded-2xl border border-border bg-surface p-3 text-sm"
        />
        <Button
          size="lg"
          className="w-full"
          disabled={!rating || pending}
          onClick={() =>
            startTransition(async () => {
              const res = await submitFeedbackAction(token, rating, comment);
              if (res?.ok || (res?.ok === false && res.error === "already_answered")) setSent(true);
              else fail(res?.ok === false ? res.error : "internal");
            })
          }
        >
          {t("send")}
        </Button>
        {error ? (
          <p role="alert" className="text-center text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    );

  const n = wheel?.length ?? 0;
  const slice = n ? 360 / n : 0;
  return (
    <div className="space-y-5 text-center">
      <p className="text-lg font-bold">{rating && rating <= 2 ? t("sorry") : t("thanks")}</p>
      {wheel && n >= 2 ? (
        prize ? (
          <div className="rounded-2xl bg-accent-soft p-5">
            <p className="text-sm text-fg-muted">{prize.couponCode ? t("youWon") : t("noLuck")}</p>
            <p className="mt-1 text-2xl font-black">{prize.label}</p>
            {prize.couponCode ? (
              <>
                <p className="mt-3 font-mono text-xl font-bold tracking-widest" dir="ltr">
                  {prize.couponCode}
                </p>
                <p className="mt-1 text-xs text-fg-muted">{t("couponHint")}</p>
              </>
            ) : null}
          </div>
        ) : (
          <>
            <p className="text-sm text-fg-muted">{t("spinHint")}</p>
            <div className="relative mx-auto size-64">
              <div
                aria-hidden="true"
                className="absolute start-1/2 -top-1 z-10 size-0 -translate-x-1/2 border-x-[10px] border-t-[18px] border-x-transparent border-t-fg rtl:translate-x-1/2"
              />
              <svg
                viewBox="-100 -100 200 200"
                className="size-full transition-transform duration-[3500ms] ease-out"
                style={{ transform: `rotate(${turn}deg)` }}
                role="img"
                aria-label={t("wheel")}
              >
                {wheel.map((label, i) => {
                  const a0 = ((i * slice - 90) * Math.PI) / 180;
                  const a1 = (((i + 1) * slice - 90) * Math.PI) / 180;
                  const mid = (((i + 0.5) * slice - 90) * Math.PI) / 180;
                  const large = slice > 180 ? 1 : 0;
                  return (
                    <g key={i}>
                      <path
                        d={`M0 0 L${95 * Math.cos(a0)} ${95 * Math.sin(a0)} A95 95 0 ${large} 1 ${95 * Math.cos(a1)} ${95 * Math.sin(a1)} Z`}
                        fill={COLORS[i % COLORS.length]}
                        stroke="white"
                        strokeWidth="1.5"
                      />
                      <text
                        x={58 * Math.cos(mid)}
                        y={58 * Math.sin(mid)}
                        fill="white"
                        fontSize="10"
                        fontWeight="700"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        transform={`rotate(${upright((i + 0.5) * slice)} ${58 * Math.cos(mid)} ${58 * Math.sin(mid)})`}
                      >
                        {label.slice(0, 14)}
                      </text>
                    </g>
                  );
                })}
                <circle r="12" fill="white" />
              </svg>
            </div>
            <Button
              size="lg"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await spinWheelAction(token);
                  if (!res?.ok || !res.data) return fail(res?.ok === false ? res.error : "internal");
                  const won = res.data;
                  // Land the middle of the won slice under the pointer, after 5 full turns.
                  setTurn(5 * 360 + (360 - (won.index + 0.5) * slice));
                  setTimeout(() => setPrize({ label: won.label, couponCode: won.couponCode }), 3600);
                })
              }
            >
              {t("spin")}
            </Button>
            {error ? (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
          </>
        )
      ) : null}
    </div>
  );
}
