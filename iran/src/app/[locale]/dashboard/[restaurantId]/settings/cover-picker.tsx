"use client";

import { Check, ImageUp, Images, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { ActionForm, FormFeedback, useActionForm } from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { chooseCoverAction, uploadCoverAction } from "./actions";

export type CoverChoices = {
  mode: "auto" | "upload" | "dish";
  current: string | null;
  selectedKey: string | null;
  photos: { id: string; key: string; name: string; url: string }[];
};

/** The photo guests see on the guide card and the restaurant page: upload, a dish photo, or automatic. */
export function CoverPicker({
  restaurantId,
  choices,
  disabled,
}: {
  restaurantId: string;
  choices: CoverChoices;
  disabled: boolean;
}) {
  const t = useTranslations("listing");
  const upload = useActionForm(uploadCoverAction.bind(null, restaurantId));
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDishes, setShowDishes] = useState(choices.mode === "dish");
  const shown = preview ?? choices.current;

  const choose = (imageId: string | null) =>
    start(async () => {
      setPreview(null);
      const res = await chooseCoverAction(restaurantId, imageId);
      setError(res && !res.ok ? res.error : null);
    });

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">{t("cover")}</p>
        <p className="text-xs text-fg-muted">{t("coverHint")}</p>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative aspect-[16/10] w-full shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-accent to-accent-hover ring-1 ring-border sm:w-72">
          {shown ? <img src={shown} alt="" className="absolute inset-0 size-full object-cover" /> : null}
          <span className="absolute start-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-bold text-white">
            {t(`coverMode.${preview ? "upload" : choices.mode}`)}
          </span>
          {pending || upload.pending ? <span className="absolute inset-0 animate-pulse bg-white/30" /> : null}
        </div>
        {!disabled ? (
          <div className="flex flex-wrap gap-2 sm:flex-col sm:items-start">
            <ActionForm form={upload}>
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full bg-fg px-4 text-sm font-bold text-bg focus-within:ring-4 focus-within:ring-[var(--ring)]">
                <ImageUp className="size-4" aria-hidden="true" />
                {t("coverUpload")}
                <input
                  type="file"
                  name="cover"
                  accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setPreview(URL.createObjectURL(f));
                    e.target.form?.requestSubmit();
                  }}
                />
              </label>
            </ActionForm>
            {choices.photos.length ? (
              <button
                type="button"
                onClick={() => setShowDishes((v) => !v)}
                aria-expanded={showDishes}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-surface-2 px-4 text-sm font-bold hover:bg-surface-3"
              >
                <Images className="size-4" aria-hidden="true" />
                {t("coverFromMenu")}
              </button>
            ) : null}
            {choices.mode !== "auto" ? (
              <button
                type="button"
                onClick={() => choose(null)}
                disabled={pending}
                className="inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-fg-muted hover:text-fg"
              >
                <Sparkles className="size-4" aria-hidden="true" />
                {t("coverAuto")}
              </button>
            ) : null}
            <p className="text-xs text-fg-muted sm:max-w-56">{t("coverSize")}</p>
          </div>
        ) : null}
      </div>
      <FormFeedback state={upload.state} success={t("coverSaved")} />
      {error ? (
        <p role="alert" className="rounded-2xl bg-danger-soft px-4 py-3 text-sm font-medium text-danger">
          {t("coverError")}
        </p>
      ) : null}
      {showDishes && !disabled ? (
        <ul className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto rounded-2xl bg-surface-2 p-2 sm:grid-cols-8 xl:grid-cols-10">
          {choices.photos.map((p) => {
            const on = choices.selectedKey === p.key && !preview;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => choose(p.id)}
                  disabled={pending}
                  aria-pressed={on}
                  title={p.name}
                  className={cn(
                    "relative block aspect-square w-full overflow-hidden rounded-xl ring-2 transition",
                    on ? "ring-accent" : "ring-transparent hover:ring-border-strong",
                  )}
                >
                  <img src={p.url} alt={p.name} loading="lazy" className="size-full object-cover" />
                  {on ? (
                    <span className="absolute end-1 top-1 grid size-6 place-items-center rounded-full bg-accent text-accent-fg">
                      <Check className="size-4" aria-hidden="true" />
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
