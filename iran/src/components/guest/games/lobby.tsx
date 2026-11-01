"use client";

import { Crown, Dices, Play, Plus, Trophy, Users, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { cancelGameAction, createGameAction, joinGameAction } from "@/app/[locale]/table/games/actions";
import { renameAction } from "@/app/[locale]/table/actions";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/cn";

type Player = { name: string; table: string | null; wins: number };
type Card = {
  id: string;
  status: string;
  target: number;
  white: Player;
  black: Player | null;
  mine: boolean;
  myTurn: boolean;
  won: boolean | null;
  score: { w: number; b: number } | null;
};

export function PlayerTag({ p, className }: { p: Player; className?: string }) {
  const t = useTranslations("games");
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <span className="truncate font-semibold">{p.name}</span>
      {p.table ? (
        <span className="shrink-0 text-xs text-fg-muted">· {t("table", { table: p.table })}</span>
      ) : null}
      <span
        className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-tone-amber/15 px-1.5 py-0.5 text-[11px] font-bold text-tone-amber"
        title={t("winsTitle", { n: p.wins })}
      >
        <Trophy className="size-3" aria-hidden="true" />
        {p.wins}
      </span>
    </span>
  );
}

/** The games room: open requests to join, a new request (3 or 5 points), the guest's games. */
export function GamesLobby({
  lobby,
  me,
}: {
  lobby: { open: Card[]; mine: Card[]; openCount: number; myWins: number };
  me: string | null;
}) {
  const t = useTranslations("games");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<3 | 5>(3);
  const [name, setName] = useState(me ?? "");
  const myOpen = lobby.mine.find((c) => c.status === "open");
  const playing = lobby.mine.filter((c) => c.status === "playing");
  const finished = lobby.mine.filter((c) => c.status === "finished");

  const go = (fn: () => Promise<{ ok: boolean; error?: string; data?: unknown } | null>) =>
    start(async () => {
      setError(null);
      if (!me && name.trim()) {
        const fd = new FormData();
        fd.set("displayName", name.trim());
        await renameAction(null, fd);
      }
      const res = await fn();
      if (res && !res.ok)
        setError(
          t.has(`errors.${res.error}`)
            ? t(`errors.${res.error}` as "errors.game_taken")
            : t("errors.generic"),
        );
      else if (res?.data && typeof res.data === "object" && "id" in res.data)
        router.push(`/table/games/${(res.data as { id: string }).id}`);
    });

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-accent to-accent-hover p-5 text-accent-fg">
        <Dices className="absolute -end-4 -bottom-6 size-32 opacity-15" aria-hidden="true" />
        <p className="text-sm font-semibold opacity-90">{t("backgammon")}</p>
        <h2 className="mt-1 text-2xl font-extrabold">{t("heroTitle")}</h2>
        <p className="mt-1 max-w-sm text-sm opacity-90">{t("heroBody")}</p>
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
          <Trophy className="size-3.5" aria-hidden="true" />
          {t("myWins", { n: lobby.myWins })}
        </p>
      </section>

      {error ? (
        <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {playing.length ? (
        <section>
          <h3 className="mb-2 text-sm font-bold text-fg-muted">{t("myGames")}</h3>
          <ul className="space-y-2">
            {playing.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/table/games/${c.id}`}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border bg-surface p-4",
                    c.myTurn ? "border-accent ring-2 ring-accent/30" : "border-border",
                  )}
                >
                  <span className="grid size-11 place-items-center rounded-xl bg-accent-soft text-accent-text">
                    <Play className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    <PlayerTag p={c.white} />
                    <span className="block text-xs text-fg-muted">
                      {t("vs")} {c.black?.name} · {c.score?.w ?? 0} – {c.score?.b ?? 0} ·{" "}
                      {t("toPoints", { n: c.target })}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-xs font-bold",
                      c.myTurn ? "text-accent-text" : "text-fg-muted",
                    )}
                  >
                    {c.myTurn ? t("yourTurn") : t("resume")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-3xl border border-border bg-surface p-5">
        <h3 className="flex items-center gap-2 font-bold">
          <Plus className="size-4 text-accent-text" aria-hidden="true" />
          {myOpen ? t("waitingTitle") : t("newGame")}
        </h3>
        {myOpen ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="relative flex size-3">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex size-3 rounded-full bg-accent" />
            </span>
            <p className="flex-1 text-sm text-fg-muted">{t("waitingBody", { n: myOpen.target })}</p>
            <button
              type="button"
              disabled={pending}
              onClick={() => go(() => cancelGameAction(myOpen.id))}
              className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-fg-muted ring-1 ring-border"
            >
              <X className="size-4" aria-hidden="true" />
              {t("cancel")}
            </button>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {!me ? (
              <label className="block">
                <span className="text-sm font-semibold">{t("yourName")}</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 40))}
                  placeholder={t("namePlaceholder")}
                  className="mt-1 h-11 w-full rounded-xl border border-border-strong bg-surface px-3 text-sm"
                />
              </label>
            ) : null}
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t("length")}>
              {([3, 5] as const).map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={target === n}
                  onClick={() => setTarget(n)}
                  className={cn(
                    "rounded-2xl px-3 py-3 text-start ring-1 ring-inset",
                    target === n ? "bg-accent-soft ring-accent" : "ring-border hover:bg-surface-2",
                  )}
                >
                  <span className="block text-lg font-extrabold">{t("points", { n })}</span>
                  <span className="block text-xs text-fg-muted">{n === 3 ? t("short") : t("long")}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => go(() => createGameAction(target))}
              className="h-12 w-full rounded-full bg-accent text-base font-bold text-accent-fg disabled:opacity-60"
            >
              {t("create")}
            </button>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-fg-muted">
          <Users className="size-4" aria-hidden="true" />
          {t("openGames")}
        </h3>
        {lobby.open.length ? (
          <ul className="space-y-2">
            {lobby.open.map((c) => (
              <li
                key={c.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4"
              >
                <span className="min-w-0 flex-1 text-sm">
                  <PlayerTag p={c.white} />
                  <span className="block text-xs text-fg-muted">{t("wantsToPlay", { n: c.target })}</span>
                </span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => go(() => joinGameAction(c.id))}
                  className="h-10 shrink-0 rounded-full bg-accent px-4 text-sm font-bold text-accent-fg disabled:opacity-60"
                >
                  {t("join")}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl bg-surface-2 px-4 py-6 text-center text-sm text-fg-muted">
            {t("noOpen")}
          </p>
        )}
      </section>

      {finished.length ? (
        <section>
          <h3 className="mb-2 text-sm font-bold text-fg-muted">{t("recent")}</h3>
          <ul className="space-y-2">
            {finished.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/table/games/${c.id}`}
                  className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-sm"
                >
                  <Crown
                    className={cn("size-4", c.won ? "text-tone-amber" : "text-fg-muted")}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate">
                    {c.white.name} {c.score?.w ?? 0} – {c.score?.b ?? 0} {c.black?.name}
                  </span>
                  <span className={cn("text-xs font-bold", c.won ? "text-success" : "text-fg-muted")}>
                    {c.won ? t("won") : t("lost")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
