import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "@/i18n/navigation";
import { requireSuperAdmin } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { listRestaurantsForAdmin } from "@/server/modules/admin/service";
import { setRestaurantStatusAction } from "../actions";

export default function AdminRestaurantsPage({ searchParams }: PageProps<"/[locale]/admin/restaurants">) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <RestaurantsTable searchParams={searchParams} />
    </Suspense>
  );
}

async function RestaurantsTable({
  searchParams,
}: {
  searchParams: PageProps<"/[locale]/admin/restaurants">["searchParams"];
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : undefined;
  const status = sp.status === "active" || sp.status === "suspended" ? sp.status : undefined;
  const [t, tc, format, rows] = await Promise.all([
    getTranslations("admin"),
    getTranslations("common"),
    getFormatter(),
    listRestaurantsForAdmin(db, { q, status }),
  ]);

  return (
    <>
      <PageHeader title={t("restaurants.title")} />
      <form className="mb-4 flex flex-wrap gap-2" role="search">
        <Input
          name="q"
          defaultValue={q}
          placeholder={t("restaurants.searchPlaceholder")}
          className="max-w-xs"
          aria-label={t("restaurants.searchPlaceholder")}
        />
        <select
          name="status"
          defaultValue={status ?? ""}
          className="h-11 rounded-xl border border-border bg-surface px-3 text-sm"
          aria-label={t("restaurants.all")}
        >
          <option value="">{t("restaurants.all")}</option>
          <option value="active">{t("status.active")}</option>
          <option value="suspended">{t("status.suspended")}</option>
        </select>
        <Button type="submit" variant="secondary" className="h-11">
          {tc("search")}
        </Button>
      </form>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-start text-fg-muted">
            <tr>
              <th className="px-5 py-3 text-start font-medium">{t("restaurants.name")}</th>
              <th className="px-5 py-3 text-start font-medium">{t("restaurants.organization")}</th>
              <th className="px-5 py-3 text-end font-medium">{t("restaurants.orders")}</th>
              <th className="px-5 py-3 text-start font-medium">{tc("status")}</th>
              <th className="px-5 py-3 text-end font-medium">
                <span className="sr-only">{tc("actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-5 py-3">
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-fg-subtle">
                    /{r.slug} · {format.dateTime(r.createdAt, { dateStyle: "medium" })}
                  </p>
                </td>
                <td className="px-5 py-3 text-fg-muted">{r.organizationName}</td>
                <td className="px-5 py-3 text-end tabular-nums">{r.ordersCount}</td>
                <td className="px-5 py-3">
                  <Badge tone={r.status === "active" ? "success" : "danger"}>{t(`status.${r.status}`)}</Badge>
                </td>
                <td className="px-5 py-3">
                  <div className="flex justify-end gap-2">
                    <Link href={`/dashboard/${r.id}`} className={buttonClasses("ghost", "sm")}>
                      {t("restaurants.open")}
                    </Link>
                    <form action={setRestaurantStatusAction}>
                      <input type="hidden" name="restaurantId" value={r.id} />
                      <input
                        type="hidden"
                        name="status"
                        value={r.status === "active" ? "suspended" : "active"}
                      />
                      <Button
                        type="submit"
                        size="sm"
                        variant={r.status === "active" ? "secondary" : "primary"}
                      >
                        {r.status === "active" ? t("restaurants.suspend") : t("restaurants.reactivate")}
                      </Button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-fg-muted">
                  —
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </>
  );
}
