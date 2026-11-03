import { Suspense } from "react";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarDays, Mail, Phone, Star, Users } from "lucide-react";
import { PageHeader } from "@/components/dashboard/app-shell";
import { LiveRefresh } from "@/components/realtime/live";
import { StayActions } from "@/components/pms/stay-card";
import { FolioPanel } from "@/components/pms/folio-panel";
import { Link } from "@/i18n/navigation";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { diningTables, stays as staysTable } from "@/server/db/schema";
import { can } from "@/server/tenancy";
import { getMoney } from "@/lib/money-server";
import { getStay } from "@/server/modules/pms/stays";
import { getPmsSettings, listRatePlans, listRoomTypes } from "@/server/modules/pms/setup";
import { listAccounts } from "@/server/modules/pms/guests";
import { listMinibar } from "@/server/modules/pms/minibar";
import { bookingsOfStay } from "@/server/modules/pms/wellness";
import { nightsBetween } from "@/server/modules/pms/calc";
import { StatusText } from "@/components/pms/status-text";
import { calendarLocale } from "@/lib/jalali-calendar";
import { EDITION } from "@/config/edition";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/stays/[stayId]">;

export default function StayPage({ params }: Props) {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-surface-2" />}>
      <Stay params={params} />
    </Suspense>
  );
}

/** The reservation card: guest, dates, room, nights, folios and every front desk action. */
async function Stay({ params }: Pick<Props, "params">) {
  const { restaurantId, stayId } = await params;
  const ctx = await requireRestaurant(restaurantId, "frontdesk.view");
  const rid = ctx.restaurant.id;
  const card = await getStay(db, ctx, stayId);
  const locale = await getLocale();
  const [t, tSrc, money, settings, types, plans, accounts, minibar, spa, rooms, busy] = await Promise.all([
    getTranslations("pms.card"),
    getTranslations("pms.source"),
    getMoney(ctx.restaurant.currency),
    getPmsSettings(db, rid, ctx.restaurant.timezone),
    listRoomTypes(db, rid),
    listRatePlans(db, rid, true),
    listAccounts(db, rid),
    listMinibar(db, rid, true),
    bookingsOfStay(db, rid, stayId),
    db
      .select({
        id: diningTables.id,
        label: diningTables.label,
        roomTypeId: diningTables.roomTypeId,
        housekeeping: diningTables.housekeeping,
      })
      .from(diningTables)
      .where(
        and(
          eq(diningTables.restaurantId, rid),
          eq(diningTables.kind, "room"),
          isNull(diningTables.deletedAt),
        ),
      )
      .orderBy(diningTables.number, diningTables.label),
    db
      .select({
        roomId: staysTable.roomId,
        arrival: staysTable.arrival,
        departure: staysTable.departure,
        id: staysTable.id,
      })
      .from(staysTable)
      .where(
        and(
          eq(staysTable.restaurantId, rid),
          inArray(staysTable.status, ["tentative", "confirmed", "in_house"]),
        ),
      ),
  ]);
  const s = card.stay;
  const g = card.guest;
  const balance = card.folios.reduce((sum, f) => sum + (f.status === "open" ? f.balanceCents : 0), 0);
  const taken = new Set(
    busy
      .filter((b) => b.id !== s.id && b.roomId && b.arrival < s.departure && b.departure > s.arrival)
      .map((b) => b.roomId),
  );
  const fmt = (d: string) =>
    new Intl.DateTimeFormat(calendarLocale(locale, EDITION), {
      weekday: "short",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${d}T12:00:00Z`));
  return (
    <>
      <PageHeader
        title={`#${s.number} | ${[g.lastName, g.firstName].filter(Boolean).join(" ")}`}
        description={`${card.typeCode}${card.roomLabel ? ` | ${t("roomN", { room: card.roomLabel })}` : ""} | ${tSrc(s.source)}${s.channelRef ? ` (${s.channelRef})` : ""}`}
        actions={
          <StayActions
            restaurantId={rid}
            currency={ctx.restaurant.currency}
            businessDate={settings.businessDate}
            stay={{ ...s, accountName: card.accountName, balanceCents: balance }}
            rooms={rooms.map((r) => ({ ...r, free: !taken.has(r.id) && r.housekeeping !== "out_of_order" }))}
            types={types.map((x) => ({ id: x.id, code: x.code, name: x.name }))}
            plans={plans.map((p) => ({ id: p.id, code: p.code, name: p.name }))}
            minibar={minibar.map((m) => ({ id: m.id, name: m.name, priceCents: m.priceCents }))}
            canManage={can(ctx, "frontdesk.manage")}
            canPost={can(ctx, "folio.post")}
          />
        }
      />
      <LiveRefresh types={["notification.created", "order.created", "payment.updated"]} />
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <section className="space-y-3 rounded-2xl border border-border bg-surface p-5">
            <StatusText status={s.status} />
            <p className="flex items-center gap-2 text-sm">
              <CalendarDays className="size-4 text-fg-muted" aria-hidden="true" />
              {fmt(s.arrival)} → {fmt(s.departure)}
            </p>
            <p className="text-sm text-fg-muted">
              {t("nights", { n: nightsBetween(s.arrival, s.departure) })} | {money(s.totalCents)}
            </p>
            <p className="flex items-center gap-2 text-sm">
              <Users className="size-4 text-fg-muted" aria-hidden="true" />
              {t("people", { adults: s.adults, children: s.children })}
            </p>
            {s.eta ? <p className="text-sm">{t("eta", { time: s.eta })}</p> : null}
            {card.accountName ? (
              <p className="text-sm font-semibold">{t("billedTo", { account: card.accountName })}</p>
            ) : null}
            {s.notes ? (
              <p className="rounded-xl bg-surface-2 p-3 text-sm whitespace-pre-line">{s.notes}</p>
            ) : null}
          </section>
          <section className="space-y-2 rounded-2xl border border-border bg-surface p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              {g.vip ? (
                <Star className="size-4 fill-[var(--brass)] text-[var(--brass)]" aria-label="VIP" />
              ) : null}
              <Link href={`/dashboard/${rid}/guests/${g.id}`} className="hover:underline">
                {[g.lastName, g.firstName].filter(Boolean).join(" ")}
              </Link>
            </h2>
            {g.phone ? (
              <p className="flex items-center gap-2 text-sm" dir="ltr">
                <Phone className="size-4 text-fg-muted" aria-hidden="true" />
                {g.phone}
              </p>
            ) : null}
            {g.email ? (
              <p className="flex items-center gap-2 text-sm" dir="ltr">
                <Mail className="size-4 text-fg-muted" aria-hidden="true" />
                {g.email}
              </p>
            ) : null}
            {g.preferences ? <p className="rounded-xl bg-accent-soft p-3 text-sm">{g.preferences}</p> : null}
            {g.blacklisted ? <p className="text-sm font-semibold text-danger">{t("blacklisted")}</p> : null}
          </section>
          {spa.length ? (
            <section className="space-y-2 rounded-2xl border border-border bg-surface p-5">
              <h2 className="font-semibold">{t("wellness")}</h2>
              <ul className="space-y-1 text-sm">
                {spa.map((b) => (
                  <li key={b.id} className={b.status === "cancelled" ? "text-fg-subtle line-through" : ""}>
                    {new Intl.DateTimeFormat(calendarLocale(locale, EDITION), {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                      timeZone: ctx.restaurant.timezone,
                    }).format(b.startsAt)}{" "}
                    | {b.service} | {b.people} 👤
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {can(ctx, "frontdesk.manage") && (s.status === "in_house" || s.status === "confirmed") ? (
            <Link
              href={`/dashboard/${rid}/wellness?stay=${s.id}`}
              className="block rounded-2xl border border-dashed border-border-strong p-4 text-center text-sm font-semibold text-fg-muted hover:bg-surface"
            >
              {t("bookWellness")}
            </Link>
          ) : null}
        </aside>
        <FolioPanel
          restaurantId={rid}
          stayId={s.id}
          currency={ctx.restaurant.currency}
          folios={card.folios.map((f) => ({
            id: f.id,
            number: f.number,
            status: f.status,
            label: f.label,
            accountName: f.accountName,
            balanceCents: f.balanceCents,
            chargesCents: f.chargesCents,
            creditsCents: f.creditsCents,
            lines: f.lines.map((l) => ({
              id: l.id,
              businessDate: l.businessDate,
              kind: l.kind,
              department: l.department,
              description: l.description,
              quantity: l.quantity,
              unitCents: l.unitCents,
              amountCents: l.amountCents,
              taxCents: l.taxCents,
              method: l.method,
              voidedAt: l.voidedAt?.toISOString() ?? null,
              voidReason: l.voidReason,
            })),
          }))}
          accounts={accounts.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name }))}
          defaultAccountId={s.accountId}
          canPost={can(ctx, "folio.post")}
          canAdjust={can(ctx, "folio.adjust")}
        />
      </div>
    </>
  );
}
