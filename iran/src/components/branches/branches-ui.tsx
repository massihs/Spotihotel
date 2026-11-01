"use client";

import { Copy, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Sheet, field, useRun } from "@/components/ui/sheet-kit";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";
import { copyMenuAction, createBranchAction } from "@/app/[locale]/dashboard/[restaurantId]/branches/actions";

const primary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-accent px-4 text-sm font-semibold text-accent-fg disabled:opacity-50";

function Check({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--accent)]"
      />
      {label}
    </label>
  );
}

export function NewBranchButton({ rid, current }: { rid: string; current: string }) {
  const t = useTranslations("branches");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { pending, error, run } = useRun();
  const [name, setName] = useState("");
  const [copyMenu, setCopyMenu] = useState(true);
  const [copySettings, setCopySettings] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={primary}>
        <Plus className="size-4" />
        {t("newBranch")}
      </button>
      {open ? (
        <Sheet title={t("newBranch")} onClose={() => setOpen(false)}>
          <div className="space-y-3">
            <label className="block text-sm font-medium">
              {t("branchName")}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("branchNamePlaceholder", { name: current })}
                maxLength={120}
                className={cn(field, "mt-1")}
                autoFocus
              />
            </label>
            <div className="space-y-2 rounded-xl bg-surface-2 p-3">
              <Check checked={copyMenu} onChange={setCopyMenu} label={t("copyMenuFrom", { name: current })} />
              <Check checked={copySettings} onChange={setCopySettings} label={t("copySettings")} />
            </div>
            <p className="text-xs text-fg-muted">{t("newBranchHint")}</p>
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <button
              type="button"
              disabled={pending || name.trim().length < 2}
              className={cn(primary, "w-full")}
              onClick={() =>
                run(async () => {
                  const res = await createBranchAction(rid, { name, copyMenu, copySettings });
                  if (res?.ok && res.data) router.push(`/dashboard/${res.data.id}`);
                  return res;
                })
              }
            >
              {pending ? t("creating") : t("create")}
            </button>
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

export function ImportMenu({ rid, sources }: { rid: string; sources: { id: string; name: string }[] }) {
  const t = useTranslations("branches");
  const { pending, error, run } = useRun();
  const [from, setFrom] = useState(sources[0]?.id ?? "");
  const [mode, setMode] = useState<"append" | "replace">("append");
  const [done, setDone] = useState<{ categories: number; products: number } | null>(null);
  if (!sources.length) return null;
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <p className="mb-1 flex items-center gap-2 font-semibold">
        <Copy className="size-4 text-accent" />
        {t("importMenu")}
      </p>
      <p className="mb-3 text-sm text-fg-muted">{t("importMenuHint")}</p>
      <div className="flex flex-wrap gap-2">
        <select
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className={cn(field, "w-auto min-w-48 flex-1")}
        >
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-2 p-1">
          {(["append", "replace"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "h-9 rounded-lg px-3 text-sm font-semibold",
                mode === m ? "bg-surface shadow-sm" : "text-fg-muted",
              )}
            >
              {t(`modes.${m}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          disabled={pending || !from}
          className={primary}
          onClick={() =>
            window.confirm(mode === "replace" ? t("confirmReplace") : t("confirmAppend")) &&
            run(async () => {
              const res = await copyMenuAction(rid, from, mode);
              if (res?.ok && res.data) setDone(res.data);
              return res;
            })
          }
        >
          {pending ? t("copying") : t("import")}
        </button>
      </div>
      {done ? <p className="mt-2 text-sm font-semibold text-success">{t("copied", done)}</p> : null}
      {error ? <p className="mt-2 text-sm text-danger">{error}</p> : null}
    </div>
  );
}
