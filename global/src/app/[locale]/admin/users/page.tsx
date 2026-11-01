import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { requireSuperAdmin } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { listUsersForAdmin } from "@/server/modules/admin/service";

export default function AdminUsersPage({ searchParams }: PageProps<"/[locale]/admin/users">) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <UsersTable searchParams={searchParams} />
    </Suspense>
  );
}

async function UsersTable({
  searchParams,
}: {
  searchParams: PageProps<"/[locale]/admin/users">["searchParams"];
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : undefined;
  const [t, tc, format, rows] = await Promise.all([
    getTranslations("admin"),
    getTranslations("common"),
    getFormatter(),
    listUsersForAdmin(db, { q }),
  ]);

  return (
    <>
      <PageHeader title={t("users.title")} />
      <form className="mb-4" role="search">
        <Input
          name="q"
          defaultValue={q}
          placeholder={t("users.searchPlaceholder")}
          className="max-w-xs"
          aria-label={t("users.searchPlaceholder")}
        />
      </form>
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-fg-muted">
            <tr>
              <th className="px-5 py-3 text-start font-medium">{t("users.name")}</th>
              <th className="px-5 py-3 text-end font-medium">{t("users.restaurants")}</th>
              <th className="px-5 py-3 text-start font-medium">{t("users.lastLogin")}</th>
              <th className="px-5 py-3 text-start font-medium">{tc("status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((u) => (
              <tr key={u.id}>
                <td className="px-5 py-3">
                  <p className="font-medium">
                    {u.fullName}{" "}
                    {u.isSuperAdmin ? <Badge tone="accent">{t("users.superAdmin")}</Badge> : null}
                  </p>
                  <p className="text-xs text-fg-subtle">{u.email}</p>
                </td>
                <td className="px-5 py-3 text-end tabular-nums">{u.restaurantsCount}</td>
                <td className="px-5 py-3 text-fg-muted">
                  {u.lastLoginAt
                    ? format.dateTime(u.lastLoginAt, { dateStyle: "medium", timeStyle: "short" })
                    : t("users.never")}
                </td>
                <td className="px-5 py-3">
                  <Badge tone={u.status === "active" ? "success" : "neutral"}>
                    {t(`status.${u.status}`)}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
