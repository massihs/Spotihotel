import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { AppShell, ShellSkeleton } from "@/components/dashboard/app-shell";
import { IconChart, IconStore, IconUsers } from "@/components/ui/icons";
import { requireSuperAdmin } from "@/server/auth/current";

export default function AdminLayout({ children }: LayoutProps<"/[locale]/admin">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AdminShell>{children}</AdminShell>
    </Suspense>
  );
}

async function AdminShell({ children }: { children: React.ReactNode }) {
  const user = await requireSuperAdmin();
  const t = await getTranslations("nav");
  return (
    <AppShell
      title={t("admin")}
      subtitle="Super admin"
      user={user}
      nav={[
        { href: "/admin", label: t("adminOverview"), icon: <IconChart />, exact: true },
        { href: "/admin/restaurants", label: t("adminRestaurants"), icon: <IconStore /> },
        { href: "/admin/users", label: t("adminUsers"), icon: <IconUsers /> },
      ]}
    >
      {children}
    </AppShell>
  );
}
