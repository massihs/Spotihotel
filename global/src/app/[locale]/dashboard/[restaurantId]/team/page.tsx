import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireRestaurant } from "@/server/auth/current";
import { canAssignRole, PERMISSIONS, ROLE_PERMISSIONS } from "@/server/auth/permissions";
import { db } from "@/server/db/client";
import { listMembers } from "@/server/modules/members/service";
import { AddMemberDialog, EditMemberDialog } from "./member-forms";

type Params = PageProps<"/[locale]/dashboard/[restaurantId]/team">["params"];

export default function TeamPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <Team params={params} />
    </Suspense>
  );
}

async function Team({ params }: { params: Params }) {
  const { restaurantId } = await params;
  const ctx = await requireRestaurant(restaurantId, "members.manage");
  const [t, format, members] = await Promise.all([getTranslations(), getFormatter(), listMembers(db, ctx)]);
  const roles = (["admin", "staff"] as const).filter((r) => canAssignRole(ctx.role, r));
  const roleDefaults = { admin: [...ROLE_PERMISSIONS.admin], staff: [...ROLE_PERMISSIONS.staff] };

  return (
    <>
      <PageHeader
        title={t("team.title")}
        description={t("team.subtitle")}
        actions={<AddMemberDialog restaurantId={ctx.restaurant.id} roles={[...roles]} />}
      />
      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-fg-muted">
            <tr>
              <th className="px-5 py-3 text-start font-medium">{t("team.fullName")}</th>
              <th className="px-5 py-3 text-start font-medium">{t("team.role")}</th>
              <th className="px-5 py-3 text-start font-medium">{t("team.lastLogin")}</th>
              <th className="px-5 py-3 text-start font-medium">{t("team.status")}</th>
              <th className="px-5 py-3">
                <span className="sr-only">{t("common.actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {members.map((m) => {
              const isSelf = m.userId === ctx.user.id;
              const editable = !isSelf && m.role !== "owner" && canAssignRole(ctx.role, m.role);
              return (
                <tr key={m.id}>
                  <td className="px-5 py-3">
                    <p className="font-medium">
                      {m.fullName} {isSelf ? <span className="text-fg-subtle">({t("team.you")})</span> : null}
                    </p>
                    <p className="text-xs text-fg-subtle">{m.email}</p>
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={m.role === "owner" ? "accent" : "neutral"}>{t(`roles.${m.role}`)}</Badge>
                  </td>
                  <td className="px-5 py-3 text-fg-muted">
                    {m.lastLoginAt
                      ? format.dateTime(m.lastLoginAt, {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: ctx.restaurant.timezone,
                        })
                      : t("team.never")}
                  </td>
                  <td className="px-5 py-3">
                    <Badge tone={m.status === "active" ? "success" : "neutral"}>
                      {m.status === "active" ? t("team.active") : t("team.disabled")}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-end">
                    {editable ? (
                      <EditMemberDialog
                        restaurantId={ctx.restaurant.id}
                        member={m}
                        roles={[...roles]}
                        allPermissions={[...PERMISSIONS]}
                        roleDefaults={roleDefaults}
                        assignable={[...ctx.permissions]}
                      />
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </>
  );
}
