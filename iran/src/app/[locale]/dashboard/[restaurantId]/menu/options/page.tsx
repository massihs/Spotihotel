import { SlidersHorizontal } from "lucide-react";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { requireRestaurant } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { can } from "@/server/tenancy";
import { listOptionGroups } from "@/server/modules/menu/options";
import { GroupCard, NewGroupDialog } from "./option-forms";

type Params = PageProps<"/[locale]/dashboard/[restaurantId]/menu/options">["params"];

export default function OptionsPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <Options params={params} />
    </Suspense>
  );
}

async function Options({ params }: { params: Params }) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "menu.view");
  const [t, tp, groups] = await Promise.all([
    getTranslations("options"),
    getTranslations("product"),
    listOptionGroups(db, ctx),
  ]);
  const manage = can(ctx, "menu.manage");
  return (
    <>
      <Link href={`/dashboard/${ctx.restaurant.id}/menu`} className="text-sm text-fg-muted hover:text-fg">
        ← {tp("back")}
      </Link>
      <div className="mt-2">
        <PageHeader
          title={t("title")}
          description={t("subtitle")}
          actions={
            manage ? (
              <NewGroupDialog restaurantId={ctx.restaurant.id} currency={ctx.restaurant.currency} />
            ) : null
          }
        />
      </div>
      {groups.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent-soft text-accent-text">
            <SlidersHorizontal className="size-7" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-lg font-semibold">{t("empty")}</h2>
          <p className="mx-auto mt-1 max-w-md text-fg-muted">{t("emptyBody")}</p>
          {manage ? (
            <div className="mt-6 flex justify-center">
              <NewGroupDialog restaurantId={ctx.restaurant.id} currency={ctx.restaurant.currency} />
            </div>
          ) : null}
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <li key={g.id}>
              <GroupCard
                restaurantId={ctx.restaurant.id}
                group={g}
                currency={ctx.restaurant.currency}
                canManage={manage}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
