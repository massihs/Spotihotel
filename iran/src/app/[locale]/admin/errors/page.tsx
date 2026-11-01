import { Suspense } from "react";
import { getFormatter, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/dashboard/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireSuperAdmin } from "@/server/auth/current";
import { db } from "@/server/db/client";
import { listErrors } from "@/server/modules/ops/errors";
import { resolveErrorAction } from "../actions";

export default function AdminErrorsPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-surface-2" />}>
      <Errors />
    </Suspense>
  );
}

async function Errors() {
  await requireSuperAdmin();
  const [t, format, rows] = await Promise.all([getTranslations("admin"), getFormatter(), listErrors(db)]);
  const open = rows.filter((r) => !r.resolvedAt).length;
  return (
    <>
      <PageHeader
        title={t("errors.title")}
        description={t("errors.subtitle", { open, phone: process.env.ALERT_PHONE ? "on" : "off" })}
      />
      {rows.length === 0 ? (
        <Card className="px-6 py-14 text-center text-sm text-fg-muted">{t("errors.empty")}</Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold break-words">{r.message}</p>
                    <p className="mt-1 text-xs text-fg-muted" dir="ltr">
                      {[r.method, r.route, r.kind, r.digest].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-1 text-xs text-fg-muted">
                      {t("errors.seen", {
                        count: r.count,
                        first: format.dateTime(r.firstAt, { dateStyle: "short", timeStyle: "short" }),
                        last: format.dateTime(r.lastAt, { dateStyle: "short", timeStyle: "short" }),
                      })}
                    </p>
                  </div>
                  {r.resolvedAt ? (
                    <Badge tone="success">{t("errors.resolved")}</Badge>
                  ) : (
                    <form action={resolveErrorAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <Button type="submit" variant="secondary" size="sm">
                        {t("errors.resolve")}
                      </Button>
                    </form>
                  )}
                </div>
                {r.stack ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-fg-muted">{t("errors.stack")}</summary>
                    <pre
                      className="mt-2 max-h-64 overflow-auto rounded-lg bg-surface-2 p-3 text-xs"
                      dir="ltr"
                    >
                      {r.stack}
                    </pre>
                  </details>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
