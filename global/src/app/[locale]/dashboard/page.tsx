import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Logo } from "@/components/ui/logo";
import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { listUserRestaurants } from "@/server/tenancy";

export default function DashboardIndex() {
  return (
    <div className="mx-auto max-w-lg px-5 py-12">
      <Logo />
      <Suspense fallback={<div className="mt-10 h-40 animate-pulse rounded-2xl bg-surface-2" />}>
        <RestaurantPicker />
      </Suspense>
    </div>
  );
}

async function RestaurantPicker() {
  const user = await requireUser();
  const list = await listUserRestaurants(db, user.id);
  if (list.length === 1) redirect(`/dashboard/${list[0]!.id}`);
  if (list.length === 0 && user.isSuperAdmin) redirect("/admin");

  const t = await getTranslations();
  if (list.length === 0) {
    return (
      <div className="mt-10">
        <h1 className="text-xl font-semibold">{t("dashboard.noRestaurantTitle")}</h1>
        <p className="mt-2 text-fg-muted">{t("dashboard.noRestaurantBody")}</p>
      </div>
    );
  }
  return (
    <div className="mt-10">
      <h1 className="text-xl font-semibold">{t("dashboard.pickRestaurant")}</h1>
      <ul className="mt-6 space-y-2">
        {list.map((r) => (
          <li key={r.id}>
            <Link
              href={`/dashboard/${r.id}`}
              className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3 hover:border-border-strong"
            >
              <span className="font-medium">{r.name}</span>
              <span className="flex items-center gap-2">
                {r.status === "suspended" ? <Badge tone="danger">{t("admin.status.suspended")}</Badge> : null}
                <Badge>{t(`roles.${r.role}`)}</Badge>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
