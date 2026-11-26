"use client";

import { useCallback } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ExternalLink } from "@/components/icons";
import { Link } from "@/i18n/navigation";
import { CheckList, SupportConsole, type InboxItem } from "./console";
import {
  platformCloseAction,
  platformConversationAction,
  platformInboxAction,
  platformReplyAction,
} from "@/app/[locale]/admin/support/actions";

type Account = {
  id: string;
  name: string;
  kind: string;
  status: string;
  phone: string | null;
  createdAt: Date | string;
  requester: { name: string; email: string } | null;
  members: number;
  places: number;
  businessDate: string | null;
  checks: { ok: boolean; code: string; values?: Record<string, string | number> }[];
};

/** The Spotihotel team answering hotels, with each hotel's file beside the conversation. */
export function PlatformConsole() {
  const t = useTranslations("support");
  const locale = useLocale();
  const loadInbox = useCallback(async () => {
    const r = await platformInboxAction();
    return r?.ok ? { ok: true as const, data: r.data?.rows as InboxItem[] } : (r as never);
  }, []);
  const loadThread = useCallback((id: string) => platformConversationAction(id) as never, []);
  return (
    <SupportConsole
      title={t("hotelsInbox")}
      loadInbox={loadInbox}
      loadThread={loadThread}
      reply={(id, fd) => platformReplyAction(id, fd) as never}
      close={(id) => platformCloseAction(id) as never}
      rowTitle={(r) => [r.restaurant, r.guestName].filter(Boolean).join(" · ")}
      agentLabel={t("team")}
      requesterLabel={(r) => r?.guestName || r?.restaurant}
      side={(conv) => {
        const a = conv.account as Account | undefined;
        if (!a) return null;
        return (
          <div className="space-y-3 p-4 text-sm">
            <div>
              <p className="text-xs text-fg-subtle">{t("account.hotel")}</p>
              <p className="font-bold">{a.name}</p>
              <p className="text-xs text-fg-muted">
                {t(`account.kind.${a.kind === "hotel" ? "hotel" : "restaurant"}`)} ·{" "}
                {t(`account.status.${a.status === "suspended" ? "suspended" : "active"}`)}
              </p>
            </div>
            {a.requester ? (
              <div>
                <p className="text-xs text-fg-subtle">{t("account.requester")}</p>
                <p className="font-semibold">{a.requester.name}</p>
                <p className="text-xs text-fg-muted" dir="ltr">
                  {a.requester.email}
                </p>
              </div>
            ) : null}
            <dl className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-surface-2 p-2">
                <dt className="text-fg-subtle">{t("account.members")}</dt>
                <dd className="text-base font-bold tabular-nums">{a.members}</dd>
              </div>
              <div className="rounded-xl bg-surface-2 p-2">
                <dt className="text-fg-subtle">{t("account.places")}</dt>
                <dd className="text-base font-bold tabular-nums">{a.places}</dd>
              </div>
              {a.businessDate ? (
                <div className="col-span-2 rounded-xl bg-surface-2 p-2">
                  <dt className="text-fg-subtle">{t("account.businessDate")}</dt>
                  <dd className="font-bold">
                    {new Intl.DateTimeFormat(locale === "fa" ? "fa-IR-u-ca-persian" : locale, {
                      dateStyle: "medium",
                      timeZone: "UTC",
                    }).format(new Date(`${a.businessDate}T12:00:00Z`))}
                  </dd>
                </div>
              ) : null}
            </dl>
            <div>
              <p className="mb-1.5 text-xs text-fg-subtle">{t("account.checks")}</p>
              <CheckList checks={a.checks} />
            </div>
            <Link
              href={`/dashboard/${a.id}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent-text hover:underline"
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
              {t("account.open")}
            </Link>
          </div>
        );
      }}
    />
  );
}
