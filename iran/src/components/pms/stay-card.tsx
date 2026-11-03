"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MoneyField } from "@/components/ui/money-field";
import { useMoney } from "@/components/ui/use-money";
import { useRun } from "@/components/ui/sheet-kit";
import { parseMoneyInput } from "@/lib/money";
import {
  amendStayAction,
  assignRoomAction,
  cancelStayAction,
  chargeMinibarAction,
  chargeRoomOrdersAction,
  checkInAction,
  checkOutAction,
  confirmStayAction,
} from "@/app/[locale]/dashboard/[restaurantId]/hotel-actions";
import { FormError, Label, RunButton, SheetButton, inputCls } from "./kit";

type Room = { id: string; label: string; roomTypeId: string | null; housekeeping: string; free: boolean };

export function StayActions({
  restaurantId,
  currency,
  stay,
  rooms,
  types,
  plans,
  minibar,
  businessDate,
  canManage,
  canPost,
}: {
  restaurantId: string;
  currency: string;
  stay: {
    id: string;
    status: string;
    arrival: string;
    departure: string;
    adults: number;
    children: number;
    roomId: string | null;
    roomTypeId: string;
    ratePlanId: string | null;
    accountId: string | null;
    accountName: string | null;
    eta: string | null;
    notes: string | null;
    balanceCents: number;
  };
  rooms: Room[];
  types: { id: string; code: string; name: string }[];
  plans: { id: string; code: string; name: string }[];
  minibar: { id: string; name: string; priceCents: number }[];
  businessDate: string;
  canManage: boolean;
  canPost: boolean;
}) {
  const t = useTranslations("pms.card");
  const tHk = useTranslations("pms.housekeeping");
  const money = useMoney(currency);
  const s = stay;
  const arriving = s.status === "confirmed" || s.status === "tentative";
  const inHouse = s.status === "in_house";
  const r = useRun();

  if (!canManage && !canPost) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {canManage && s.status === "tentative" ? (
        <RunButton variant="outline" run={() => confirmStayAction(restaurantId, s.id)}>
          {t("confirm")}
        </RunButton>
      ) : null}
      {canManage && arriving && s.arrival <= businessDate ? (
        <RunButton variant="primary" run={() => checkInAction(restaurantId, s.id, s.roomId)}>
          {t("checkIn")}
        </RunButton>
      ) : null}
      {canManage && inHouse ? (
        <>
          <RunButton
            variant="primary"
            run={() => checkOutAction(restaurantId, s.id)}
            disabled={s.balanceCents > 0}
          >
            {t("checkOut")}
          </RunButton>
          {s.accountId && s.balanceCents > 0 ? (
            <RunButton
              run={() => checkOutAction(restaurantId, s.id, true)}
              confirm={t("confirmToAccount", { account: s.accountName ?? "" })}
            >
              {t("checkOutToAccount")}
            </RunButton>
          ) : null}
        </>
      ) : null}
      {canManage && (arriving || inHouse) ? (
        <SheetButton
          label={inHouse ? t("moveRoom") : t("assignRoom")}
          title={inHouse ? t("moveRoom") : t("assignRoom")}
        >
          {(close) => (
            <div className="space-y-3">
              <select
                className={inputCls}
                defaultValue={s.roomId ?? ""}
                onChange={(e) =>
                  e.target.value && r.run(() => assignRoomAction(restaurantId, s.id, e.target.value), close)
                }
              >
                <option value="">—</option>
                {rooms
                  .filter((x) => x.free || x.id === s.roomId)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label} · {types.find((ty) => ty.id === x.roomTypeId)?.code ?? "?"} ·{" "}
                      {tHk(x.housekeeping)}
                      {x.roomTypeId !== s.roomTypeId ? ` (${t("otherType")})` : ""}
                    </option>
                  ))}
              </select>
              <FormError error={r.error} />
            </div>
          )}
        </SheetButton>
      ) : null}
      {canManage && (arriving || inHouse) ? (
        <SheetButton label={t("amend")} title={t("amend")}>
          {(close) => (
            <Amend
              restaurantId={restaurantId}
              stay={s}
              types={types}
              plans={plans}
              inHouse={inHouse}
              done={close}
              currency={currency}
            />
          )}
        </SheetButton>
      ) : null}
      {canPost && inHouse ? (
        <>
          <RunButton run={() => chargeRoomOrdersAction(restaurantId, s.id)}>{t("chargeOrders")}</RunButton>
          {minibar.length ? (
            <SheetButton label={t("minibar")} title={t("minibar")}>
              {(close) => (
                <Minibar
                  restaurantId={restaurantId}
                  stayId={s.id}
                  items={minibar}
                  money={money}
                  done={close}
                />
              )}
            </SheetButton>
          ) : null}
        </>
      ) : null}
      {canManage && arriving ? (
        <SheetButton label={t("cancel")} title={t("cancel")} variant="ghost">
          {(close) => (
            <form
              className="space-y-4"
              action={(fd) =>
                r.run(
                  () =>
                    cancelStayAction(
                      restaurantId,
                      s.id,
                      String(fd.get("reason") ?? ""),
                      parseMoneyInput(String(fd.get("fee") ?? ""), currency) ?? 0,
                    ),
                  close,
                )
              }
            >
              <label className="block">
                <Label>{t("cancelReason")}</Label>
                <input name="reason" className={inputCls} required minLength={2} maxLength={200} />
              </label>
              <MoneyField name="fee" currency={currency} label={t("cancelFee")} hint={t("cancelFeeHint")} />
              <FormError error={r.error} />
              <Button type="submit" variant="danger" className="w-full" disabled={r.pending}>
                {t("cancel")}
              </Button>
            </form>
          )}
        </SheetButton>
      ) : null}
    </div>
  );
}

function Amend({
  restaurantId,
  stay,
  types,
  plans,
  inHouse,
  done,
  currency,
}: {
  restaurantId: string;
  stay: {
    id: string;
    arrival: string;
    departure: string;
    adults: number;
    children: number;
    roomTypeId: string;
    ratePlanId: string | null;
    eta: string | null;
    notes: string | null;
    accountId: string | null;
  };
  types: { id: string; code: string; name: string }[];
  plans: { id: string; code: string; name: string }[];
  inHouse: boolean;
  done: () => void;
  currency: string;
}) {
  const t = useTranslations("pms.book");
  const r = useRun();
  const [override, setOverride] = useState(false);
  return (
    <form
      className="grid gap-4 sm:grid-cols-2"
      action={(fd) => {
        const fixed = String(fd.get("fixedRate") ?? "").trim();
        r.run(
          () =>
            amendStayAction(restaurantId, stay.id, {
              arrival: String(fd.get("arrival")),
              departure: String(fd.get("departure")),
              adults: Number(fd.get("adults")),
              children: Number(fd.get("children")),
              roomTypeId: String(fd.get("roomTypeId")),
              ratePlanId: String(fd.get("ratePlanId") ?? "") || null,
              eta: String(fd.get("eta") ?? ""),
              notes: String(fd.get("notes") ?? ""),
              accountId: stay.accountId,
              fixedRateCents: fixed ? parseMoneyInput(fixed, currency) : null,
              override,
            }),
          done,
        );
      }}
    >
      <label>
        <Label>{t("arrival")}</Label>
        <input
          name="arrival"
          type="date"
          defaultValue={stay.arrival}
          readOnly={inHouse}
          className={inputCls}
        />
      </label>
      <label>
        <Label>{t("departure")}</Label>
        <input name="departure" type="date" defaultValue={stay.departure} className={inputCls} />
      </label>
      <label>
        <Label>{t("roomType")}</Label>
        <select name="roomTypeId" defaultValue={stay.roomTypeId} className={inputCls}>
          {types.map((x) => (
            <option key={x.id} value={x.id}>
              {x.code} — {x.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <Label>{t("ratePlan")}</Label>
        <select name="ratePlanId" defaultValue={stay.ratePlanId ?? ""} className={inputCls}>
          <option value="">{t("baseRate")}</option>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <Label>{t("adults")}</Label>
        <input name="adults" type="number" min={1} max={20} defaultValue={stay.adults} className={inputCls} />
      </label>
      <label>
        <Label>{t("children")}</Label>
        <input
          name="children"
          type="number"
          min={0}
          max={20}
          defaultValue={stay.children}
          className={inputCls}
        />
      </label>
      <label>
        <Label>{t("eta")}</Label>
        <input name="eta" type="time" defaultValue={stay.eta ?? ""} className={inputCls} />
      </label>
      <div>
        <MoneyField name="fixedRate" currency={currency} label={t("fixedRate")} />
      </div>
      <label className="sm:col-span-2">
        <Label>{t("notes")}</Label>
        <textarea
          name="notes"
          defaultValue={stay.notes ?? ""}
          className={`${inputCls} h-20 py-2`}
          maxLength={2000}
        />
      </label>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          className="size-4"
          checked={override}
          onChange={(e) => setOverride(e.target.checked)}
        />{" "}
        {t("override")}
      </label>
      <div className="sm:col-span-2">
        <FormError error={r.error} />
      </div>
      <Button type="submit" className="sm:col-span-2" disabled={r.pending}>
        {t("save")}
      </Button>
    </form>
  );
}

function Minibar({
  restaurantId,
  stayId,
  items,
  money,
  done,
}: {
  restaurantId: string;
  stayId: string;
  items: { id: string; name: string; priceCents: number }[];
  money: (c: number) => string;
  done: () => void;
}) {
  const t = useTranslations("pms.card");
  const [qty, setQty] = useState<Record<string, number>>({});
  const r = useRun();
  const lines = Object.entries(qty)
    .filter(([, n]) => n > 0)
    .map(([itemId, quantity]) => ({ itemId, quantity }));
  const total = lines.reduce(
    (s, l) => s + l.quantity * (items.find((i) => i.id === l.itemId)?.priceCents ?? 0),
    0,
  );
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 py-2">
            <span className="flex-1 font-medium">{i.name}</span>
            <span className="text-sm text-fg-muted tabular-nums">{money(i.priceCents)}</span>
            <input
              type="number"
              min={0}
              max={50}
              className={`${inputCls} h-9 w-16 text-center`}
              value={qty[i.id] ?? 0}
              onChange={(e) => setQty({ ...qty, [i.id]: Math.max(0, Number(e.target.value) || 0) })}
              aria-label={i.name}
            />
          </li>
        ))}
      </ul>
      <FormError error={r.error} />
      <Button
        className="w-full"
        disabled={!lines.length || r.pending}
        onClick={() => r.run(() => chargeMinibarAction(restaurantId, stayId, lines), done)}
      >
        {t("chargeMinibar", { total: money(total) })}
      </Button>
    </div>
  );
}
