import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card, CardHeader } from "@/components/ui/card";
import { Empty } from "@/components/ui/empty";
import { ShieldForm } from "@/components/pms/shield-ui";
import { Link } from "@/i18n/navigation";
import { getMoney } from "@/lib/money-server";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { shieldView } from "@/server/modules/pms/shield";

type Props = PageProps<"/[locale]/dashboard/[restaurantId]/shield">;

export default function ShieldPage(props: Props) {
  return (
    <Suspense fallback={<div className="skeleton h-80 rounded-2xl" />}>
      <Shield {...props} />
    </Suspense>
  );
}

/** سپر ریال: rates priced in a foreign currency or gold, kept in rials day after day. */
async function Shield({ params }: Props) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "frontdesk.view");
  const [t, v, money] = await Promise.all([
    getTranslations("shield"),
    shieldView(db, ctx),
    getMoney(ctx.restaurant.currency),
  ]);
  const rid = ctx.restaurant.id;
  const loss = v.underpriced.reduce((s, u) => s + u.lossCents, 0);
  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <ShieldForm
          rid={rid}
          currency={ctx.restaurant.currency}
          currencies={v.currencies}
          shield={v.shield}
          rows={v.rows}
          canManage={can(ctx, "restaurant.manage")}
        />
        <Card>
          <CardHeader title={t("underTitle")} count={v.underpriced.length} description={t("underHint")} />
          {v.underpriced.length ? (
            <>
              <p className="mx-5 mt-4 flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm font-semibold text-warning">
                <ShieldAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {t("underTotal", { amount: money(loss), n: v.underpriced.length })}
              </p>
              <ul className="mt-2 divide-y divide-border">
                {v.underpriced.map((u) => (
                  <li key={u.stayId}>
                    <Link
                      href={`/dashboard/${rid}/stays/${u.stayId}`}
                      className="row-hover flex items-center gap-3 px-5 py-3"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{u.guest}</span>
                        <span className="block text-xs text-fg-muted">
                          #{u.number} · {t("nights", { n: u.nights })}
                        </span>
                      </span>
                      <span className="font-bold whitespace-nowrap text-warning tabular-nums">
                        −{money(u.lossCents)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="p-4 sm:p-5">
              <Empty size="sm" icon={<ShieldCheck aria-hidden="true" />}>
                {t("underNone")}
              </Empty>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
