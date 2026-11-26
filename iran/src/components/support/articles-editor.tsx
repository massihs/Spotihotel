"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Pencil, Plus, Trash2 } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { deleteArticleAction, saveArticleAction } from "@/app/[locale]/admin/support/actions";

type L = Record<string, string>;
export type ArticleRow = {
  id: string;
  slug: string;
  audience: string;
  title: L;
  body: L;
  keywords: string;
  href: string | null;
  published: boolean;
  shown: number;
  helped: number;
};
const LANGS = ["fa", "en", "fr", "ar"] as const;

/** The assistant's knowledge: each article, its texts in four languages and the words that bring it up. */
export function ArticlesEditor({ articles }: { articles: ArticleRow[] }) {
  const t = useTranslations("support.articles");
  const [editing, setEditing] = useState<ArticleRow | "new" | null>(null);
  const [pending, start] = useTransition();
  const [audience, setAudience] = useState<"staff" | "guest">("staff");
  const list = articles.filter((a) => a.audience === audience);
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-[15px] font-bold">{t("title")}</h2>
          <p className="mt-0.5 text-xs text-fg-muted">{t("hint")}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-full bg-surface-2 p-0.5 text-xs font-semibold">
            {(["staff", "guest"] as const).map((a) => (
              <button
                key={a}
                type="button"
                aria-pressed={audience === a}
                onClick={() => setAudience(a)}
                className={cn(
                  "rounded-full px-3 py-1",
                  audience === a ? "bg-surface shadow-sm" : "text-fg-muted",
                )}
              >
                {t(`audience.${a}`)}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-4" aria-hidden="true" />
            {t("add")}
          </Button>
        </div>
      </div>
      {editing ? (
        <ArticleForm
          key={editing === "new" ? "new" : editing.id}
          article={editing === "new" ? null : editing}
          audience={audience}
          onDone={() => setEditing(null)}
        />
      ) : null}
      <ul className="divide-y divide-border">
        {list.map((a) => (
          <li key={a.id} className="flex items-start gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-semibold", !a.published && "text-fg-subtle line-through")}>
                {a.title.fa || a.title.en}
              </p>
              <p className="mt-0.5 truncate text-xs text-fg-muted">{a.keywords}</p>
            </div>
            <span className="shrink-0 text-[11px] text-fg-subtle tabular-nums">
              {t("stats", { shown: a.shown, helped: a.helped })}
            </span>
            <button
              type="button"
              onClick={() => setEditing(a)}
              aria-label={t("edit")}
              className="grid size-8 place-items-center rounded-full text-fg-muted hover:bg-surface-2"
            >
              <Pencil className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (window.confirm(t("confirmDelete")))
                  start(async () => void (await deleteArticleAction(a.id)));
              }}
              aria-label={t("delete")}
              className="grid size-8 place-items-center rounded-full text-fg-muted hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArticleForm({
  article,
  audience,
  onDone,
}: {
  article: ArticleRow | null;
  audience: "staff" | "guest";
  onDone: () => void;
}) {
  const t = useTranslations("support.articles");
  const tErr = useTranslations("errorCodes");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const field = "w-full rounded-xl border border-border bg-bg px-3 py-2 text-sm";
  return (
    <form
      className="space-y-3 border-b border-border bg-surface-2/60 px-5 py-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const per = (k: string) =>
          Object.fromEntries(LANGS.map((l) => [l, String(fd.get(`${k}.${l}`) ?? "")])) as Record<
            (typeof LANGS)[number],
            string
          >;
        start(async () => {
          const r = await saveArticleAction(article?.id ?? null, {
            slug: String(fd.get("slug") ?? ""),
            audience: (fd.get("audience") as "staff" | "guest") ?? audience,
            title: per("title"),
            body: per("body"),
            keywords: String(fd.get("keywords") ?? ""),
            href: String(fd.get("href") ?? ""),
            published: fd.get("published") === "on",
          });
          if (r?.ok) onDone();
          else setError(r?.error && tErr.has(r.error) ? tErr(r.error) : tErr("validation"));
        });
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold">
          {t("slug")}
          <input
            name="slug"
            defaultValue={article?.slug ?? ""}
            required
            pattern="[a-z0-9-]{2,60}"
            dir="ltr"
            className={field}
          />
        </label>
        <label className="text-xs font-semibold">
          {t("audienceLabel")}
          <select name="audience" defaultValue={article?.audience ?? audience} className={field}>
            <option value="staff">{t("audience.staff")}</option>
            <option value="guest">{t("audience.guest")}</option>
          </select>
        </label>
        <label className="text-xs font-semibold">
          {t("href")}
          <input
            name="href"
            defaultValue={article?.href ?? ""}
            dir="ltr"
            placeholder="{base}/frontdesk"
            className={field}
          />
        </label>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {LANGS.map((l) => (
          <fieldset
            key={l}
            className="space-y-1.5 rounded-xl border border-border bg-surface p-3"
            dir={l === "fa" || l === "ar" ? "rtl" : "ltr"}
          >
            <legend className="px-1 text-[11px] font-bold text-fg-subtle uppercase">{l}</legend>
            <input
              name={`title.${l}`}
              defaultValue={article?.title[l] ?? ""}
              placeholder={t("titleField")}
              className={field}
            />
            <textarea
              name={`body.${l}`}
              defaultValue={article?.body[l] ?? ""}
              placeholder={t("bodyField")}
              rows={3}
              className={field}
            />
          </fieldset>
        ))}
      </div>
      <label className="block text-xs font-semibold">
        {t("keywords")}
        <textarea name="keywords" defaultValue={article?.keywords ?? ""} rows={2} className={field} />
        <span className="mt-1 block font-normal text-fg-subtle">{t("keywordsHint")}</span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="published" defaultChecked={article?.published ?? true} />
        {t("published")}
      </label>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {t("save")}
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onDone}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
