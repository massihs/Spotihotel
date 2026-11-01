"use client";

import { BellRing, Check, Clock, Hand, Inbox, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { moveRequestAction } from "@/app/[locale]/dashboard/[restaurantId]/requests/actions";
import { CALL_ICON } from "@/components/guest/call-icons";
import { useRun } from "@/components/ui/sheet-kit";
import { cn } from "@/lib/cn";

export type RequestView = {
  id: string;
  room: string;
  kind: string;
  label: string | null;
  note: string | null;
  status: string;
  createdAt: string;
  takenAt: string | null;
  takenBy: string | null;
  doneAt: string | null;
};

const COLUMNS = [
  { status: "open", tone: "bg-danger-soft text-danger", Icon: Inbox },
  { status: "in_progress", tone: "bg-warning-soft text-warning", Icon: Hand },
  { status: "done", tone: "bg-success-soft text-success", Icon: Check },
] as const;

/** Minutes since a moment, refreshed every 30 s so waiting rooms stand out. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * The rooms' requests in three columns: new, someone on it, done today. One tap takes a request,
 * another marks it done; a request waiting over 10 minutes turns red.
 */
export function RequestsBoard({
  restaurantId,
  requests,
  icons,
  timeZone,
  canAct,
}: {
  restaurantId: string;
  requests: RequestView[];
  icons: Record<string, string>;
  timeZone: string;
  canAct: boolean;
}) {
  const t = useTranslations("hotel");
  const tk = useTranslations("guest.waiter.kinds");
  const now = useNow();
  const { pending, error, run } = useRun();
  const [col, setCol] = useState<string>("open");
  const [kind, setKind] = useState<string | null>(null);
  const kinds = [...new Set(requests.map((r) => r.kind))];
  const name = (r: RequestView) => r.label ?? (tk.has(r.kind as "waiter") ? tk(r.kind as "waiter") : r.kind);
  const visible = kind ? requests.filter((r) => r.kind === kind) : requests;
  const clock = (iso: string) =>
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const ago = (iso: string) => Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));

  return (
    <div>
      {kinds.length > 1 ? (
        <div className="-mx-4 mb-3 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          <button
            type="button"
            onClick={() => setKind(null)}
            aria-pressed={kind === null}
            className={cn(
              "h-9 shrink-0 rounded-full px-4 text-sm font-semibold",
              kind === null ? "bg-ink text-ink-fg" : "bg-surface text-fg-muted ring-1 ring-border",
            )}
          >
            {t("allServices")}
          </button>
          {kinds.map((k) => {
            const KIcon = CALL_ICON[icons[k] ?? "bell"] ?? BellRing;
            const sample = requests.find((r) => r.kind === k)!;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKind(kind === k ? null : k)}
                aria-pressed={kind === k}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold whitespace-nowrap",
                  kind === k ? "bg-ink text-ink-fg" : "bg-surface text-fg-muted ring-1 ring-border",
                )}
              >
                <KIcon className="size-4" aria-hidden="true" />
                {name(sample)}
                <span className="tabular-nums opacity-70">
                  {requests.filter((r) => r.kind === k && r.status !== "done").length}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
      {/* Phones: one column at a time. */}
      <div className="mb-3 grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1 md:hidden">
        {COLUMNS.map((c) => (
          <button
            key={c.status}
            type="button"
            onClick={() => setCol(c.status)}
            aria-pressed={col === c.status}
            className={cn(
              "h-10 rounded-xl text-sm font-semibold",
              col === c.status ? "bg-surface shadow-sm" : "text-fg-muted",
            )}
          >
            {t(`status.${c.status}`)}{" "}
            <span className="tabular-nums opacity-70">
              {requests.filter((r) => r.status === c.status).length}
            </span>
          </button>
        ))}
      </div>
      {error ? <p className="mb-3 rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p> : null}
      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map(({ status, tone, Icon }) => {
          const list = visible.filter((r) => r.status === status);
          return (
            <section key={status} className={cn("min-w-0", col !== status && "max-md:hidden")}>
              <h2 className="mb-2.5 hidden items-center gap-2 font-bold md:flex">
                <span className={cn("grid size-7 place-items-center rounded-lg", tone)}>
                  <Icon className="size-4" aria-hidden="true" />
                </span>
                {t(`status.${status}`)}
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular-nums">
                  {list.length}
                </span>
              </h2>
              <div className="space-y-2.5">
                {list.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-border-strong px-4 py-8 text-center text-sm text-fg-muted">
                    {t(`empty.${status}`)}
                  </p>
                ) : (
                  list.map((r) => {
                    const KindIcon = CALL_ICON[icons[r.kind] ?? "bell"] ?? BellRing;
                    const wait = ago(r.createdAt);
                    const late = r.status === "open" && wait >= 10;
                    return (
                      <article
                        key={r.id}
                        className={cn(
                          "rounded-2xl bg-surface p-3.5 ring-1 ring-border",
                          late && "ring-2 ring-danger",
                          r.status === "done" && "opacity-70",
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ink text-lg font-black text-ink-fg tabular-nums">
                            {r.room}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5 font-bold">
                              <KindIcon className="size-4 shrink-0 text-accent-text" aria-hidden="true" />
                              <span className="truncate">{name(r)}</span>
                            </p>
                            <p
                              className={cn(
                                "mt-0.5 flex items-center gap-1 text-xs",
                                late ? "font-bold text-danger" : "text-fg-muted",
                              )}
                            >
                              <Clock className="size-3.5" aria-hidden="true" />
                              <span dir="ltr">{clock(r.createdAt)}</span>
                              {r.status !== "done" ? <span>· {t("ago", { min: wait })}</span> : null}
                              {r.status === "done" && r.doneAt ? (
                                <span>
                                  · {t("doneAt")} <span dir="ltr">{clock(r.doneAt)}</span>
                                </span>
                              ) : null}
                            </p>
                          </div>
                        </div>
                        {r.note ? (
                          <p className="mt-2.5 rounded-xl bg-surface-2 px-3 py-2 text-sm leading-6">
                            {r.note}
                          </p>
                        ) : null}
                        {r.takenBy && r.status !== "open" ? (
                          <p className="mt-2 flex items-center gap-1.5 text-xs text-fg-muted">
                            <Hand className="size-3.5" aria-hidden="true" />
                            {t("takenBy", { name: r.takenBy })}
                            {r.takenAt ? (
                              <span>
                                ·{" "}
                                {t("respondedIn", {
                                  min: Math.max(
                                    0,
                                    Math.round((Date.parse(r.takenAt) - Date.parse(r.createdAt)) / 60_000),
                                  ),
                                })}
                              </span>
                            ) : null}
                          </p>
                        ) : null}
                        {canAct && r.status !== "done" ? (
                          <div className="mt-3 flex gap-2">
                            {r.status === "open" ? (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                  run(() => moveRequestAction(restaurantId, r.id, "in_progress"))
                                }
                                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent text-sm font-bold text-accent-fg disabled:opacity-50"
                              >
                                <Hand className="size-4" aria-hidden="true" />
                                {t("take")}
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => run(() => moveRequestAction(restaurantId, r.id, "open"))}
                                aria-label={t("release")}
                                title={t("release")}
                                className="grid size-10 place-items-center rounded-xl ring-1 ring-border disabled:opacity-50"
                              >
                                <RotateCcw className="size-4" aria-hidden="true" />
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => run(() => moveRequestAction(restaurantId, r.id, "done"))}
                              className={cn(
                                "inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-bold disabled:opacity-50",
                                r.status === "open" ? "ring-1 ring-border" : "bg-success text-white",
                              )}
                            >
                              <Check className="size-4" aria-hidden="true" />
                              {t("done")}
                            </button>
                          </div>
                        ) : null}
                      </article>
                    );
                  })
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
