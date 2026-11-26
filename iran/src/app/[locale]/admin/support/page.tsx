import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { PlatformConsole } from "@/components/support/platform-console";
import { ArticlesEditor } from "@/components/support/articles-editor";
import { requireSuperAdmin } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { listArticles } from "@/server/modules/support/service";

export default function AdminSupportPage() {
  return (
    <Suspense fallback={<div className="h-80 animate-pulse rounded-2xl bg-surface-2" />}>
      <AdminSupport />
    </Suspense>
  );
}

async function AdminSupport() {
  const admin = await requireSuperAdmin();
  const [t, articles] = await Promise.all([getTranslations("support"), listArticles(db, admin)]);
  return (
    <>
      <PageHeader title={t("adminTitle")} description={t("adminSubtitle")} />
      <PlatformConsole />
      <div className="mt-6">
        <ArticlesEditor articles={articles} />
      </div>
    </>
  );
}
