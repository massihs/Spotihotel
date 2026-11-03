"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { MoneyField } from "@/components/ui/money-field";
import { useRun } from "@/components/ui/sheet-kit";
import { parseMoneyInput } from "@/lib/money";
import {
  blockStatusAction,
  createBlockAction,
  roomingAction,
} from "@/app/[locale]/dashboard/[restaurantId]/hotel-actions";
import { FormError, Label, RunButton, SheetButton, inputCls } from "./kit";

type Type = { id: string; code: string; name: string };

const add = (d: string, n: number) =>
  new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function NewBlockButton({
  restaurantId,
  currency,
  today,
  types,
  plans,
  accounts,
}: {
  restaurantId: string;
  currency: string;
  today: string;
  types: Type[];
  plans: { id: string; code: string; name: string }[];
  accounts: { id: string; name: string }[];
}) {
  const t = useTranslations("pms.blocks");
  const router = useRouter();
  const r = useRun();
  const [arrival, setArrival] = useState(add(today, 7));
  const [departure, setDeparture] = useState(add(today, 9));
  const [release, setRelease] = useState(add(today, 2));
  const [rows, setRows] = useState([{ roomTypeId: types[0]?.id ?? "", rooms: 5 }]);
  return (
    <SheetButton label={t("new")} title={t("new")} variant="primary" size="md">
      {(close) => (
        <form
          className="grid gap-4 sm:grid-cols-2"
          action={(fd) =>
            r.run(async () => {
              const rate = String(fd.get("rate") ?? "").trim();
              const res = await createBlockAction(restaurantId, {
                name: String(fd.get("name")),
                status: fd.get("tentative") ? "tentative" : "definite",
                arrival,
                departure,
                releaseDate: release,
                accountId: String(fd.get("accountId") ?? "") || null,
                contactName: String(fd.get("contactName") ?? ""),
                contactPhone: String(fd.get("contactPhone") ?? ""),
                ratePlanId: String(fd.get("ratePlanId") ?? "") || null,
                rateCents: rate ? parseMoneyInput(rate, currency) : null,
                notes: String(fd.get("notes") ?? ""),
                rooms: rows.filter((x) => x.roomTypeId && x.rooms > 0),
              });
              if (res?.ok && res.data) {
                close();
                router.push(`/dashboard/${restaurantId}/blocks?id=${res.data}`);
              }
              return res;
            })
          }
        >
          <label className="sm:col-span-2">
            <Label>{t("name")}</Label>
            <input
              name="name"
              className={inputCls}
              required
              minLength={2}
              maxLength={160}
              placeholder={t("namePlaceholder")}
            />
          </label>
          <label>
            <Label>{t("arrival")}</Label>
            <DateInput
              value={arrival}
              min={today}
              onChange={(v) => {
                setArrival(v);
                if (v && departure <= v) setDeparture(add(v, 1));
                if (v && release > v) setRelease(v);
              }}
              required
            />
          </label>
          <label>
            <Label>{t("departure")}</Label>
            <DateInput value={departure} min={add(arrival, 1)} onChange={setDeparture} required />
          </label>
          <label>
            <Label hint={t("releaseHint")}>{t("release")}</Label>
            <DateInput value={release} min={today} max={arrival} onChange={setRelease} required />
          </label>
          <label>
            <Label>{t("account")}</Label>
            <select name="accountId" className={inputCls} defaultValue="">
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-2 sm:col-span-2">
            <Label>{t("rooms")}</Label>
            {rows.map((row, i) => (
              <div key={i} className="flex gap-2">
                <select
                  className={inputCls}
                  value={row.roomTypeId}
                  onChange={(e) =>
                    setRows(rows.map((x, j) => (j === i ? { ...x, roomTypeId: e.target.value } : x)))
                  }
                >
                  {types.map((ty) => (
                    <option key={ty.id} value={ty.id}>
                      {ty.code} — {ty.name}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  className={`${inputCls} w-24`}
                  value={row.rooms}
                  onChange={(e) =>
                    setRows(rows.map((x, j) => (j === i ? { ...x, rooms: Number(e.target.value) || 0 } : x)))
                  }
                  aria-label={t("roomsN")}
                />
                <button
                  type="button"
                  className="px-2 text-fg-muted hover:text-danger disabled:opacity-30"
                  disabled={rows.length <= 1}
                  onClick={() => setRows(rows.filter((_, j) => j !== i))}
                  aria-label="×"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRows([...rows, { roomTypeId: types[0]?.id ?? "", rooms: 1 }])}
            >
              <Plus className="size-4" aria-hidden="true" />
              {t("addType")}
            </Button>
          </div>
          <label>
            <Label>{t("ratePlan")}</Label>
            <select name="ratePlanId" className={inputCls} defaultValue="">
              <option value="">—</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>
          </label>
          <MoneyField name="rate" currency={currency} label={t("groupRate")} hint={t("groupRateHint")} />
          <label>
            <Label>{t("contactName")}</Label>
            <input name="contactName" className={inputCls} maxLength={120} />
          </label>
          <label>
            <Label>{t("contactPhone")}</Label>
            <input name="contactPhone" className={inputCls} maxLength={24} dir="ltr" />
          </label>
          <label className="sm:col-span-2">
            <Label>{t("notes")}</Label>
            <textarea name="notes" className={`${inputCls} h-16 py-2`} maxLength={2000} />
          </label>
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="tentative" className="size-4" /> {t("tentative")}
          </label>
          <div className="space-y-2 sm:col-span-2">
            <FormError error={r.error} />
            <Button type="submit" className="w-full" disabled={r.pending}>
              {t("create")}
            </Button>
          </div>
        </form>
      )}
    </SheetButton>
  );
}

/** Pasted rooming list: one guest per line, "Last name First name". */
export function RoomingList({
  restaurantId,
  blockId,
  types,
}: {
  restaurantId: string;
  blockId: string;
  types: Type[];
}) {
  const t = useTranslations("pms.blocks");
  const [text, setText] = useState("");
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [adults, setAdults] = useState(2);
  const r = useRun();
  const names = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-surface p-4">
      <h3 className="font-semibold">{t("rooming")}</h3>
      <p className="text-sm text-fg-muted">{t("roomingHint")}</p>
      <textarea
        className={`${inputCls} h-32 py-2`}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("roomingPlaceholder")}
      />
      <div className="flex flex-wrap gap-2">
        <select className={`${inputCls} w-auto`} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
          {types.map((ty) => (
            <option key={ty.id} value={ty.id}>
              {ty.code}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          max={20}
          className={`${inputCls} w-20`}
          value={adults}
          onChange={(e) => setAdults(Number(e.target.value) || 1)}
          aria-label={t("adults")}
        />
        <Button
          disabled={!names.length || r.pending}
          onClick={() =>
            r.run(
              () =>
                roomingAction(
                  restaurantId,
                  blockId,
                  names.map((n) => {
                    const [lastName, ...rest] = n.split(/\s+/);
                    return { lastName: lastName!, firstName: rest.join(" "), roomTypeId: typeId, adults };
                  }),
                ),
              () => setText(""),
            )
          }
        >
          {t("pickup", { n: names.length })}
        </Button>
      </div>
      <FormError error={r.error} />
    </div>
  );
}

export function BlockStatusButtons({
  restaurantId,
  blockId,
  status,
}: {
  restaurantId: string;
  blockId: string;
  status: string;
}) {
  const t = useTranslations("pms.blocks");
  if (!["tentative", "definite"].includes(status)) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {status === "tentative" ? (
        <RunButton run={() => blockStatusAction(restaurantId, blockId, "definite")}>
          {t("makeDefinite")}
        </RunButton>
      ) : null}
      <RunButton
        confirm={t("releaseConfirm")}
        run={() => blockStatusAction(restaurantId, blockId, "released")}
      >
        {t("releaseNow")}
      </RunButton>
      <RunButton
        variant="ghost"
        confirm={t("cancelConfirm")}
        run={() => blockStatusAction(restaurantId, blockId, "cancelled")}
      >
        {t("cancel")}
      </RunButton>
    </div>
  );
}
