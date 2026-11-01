"use client";

import { Check, ImagePlus, Loader2, Pause, Play, Plus, Power, Radio, Trash2, Upload, X } from "lucide-react";
import { Cover } from "@/components/music/cover";
import { Dialog } from "@/components/ui/dialog";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import {
  ActionForm,
  FormFeedback,
  SubmitButton,
  TextareaField,
  useActionForm,
  useCloseOnSuccess,
} from "@/components/ui/form";
import { cn } from "@/lib/cn";
import { fmtDuration } from "@/lib/duration";
import {
  activateSubscriptionAction,
  cancelSubscriptionAction,
  createThemeAction,
  deleteThemeAction,
  deleteTrackAction,
  setThemeFlagAction,
  setTrackActiveAction,
} from "@/app/[locale]/admin/music/actions";

const COLORS = ["#16a34a", "#0ea5e9", "#8b5cf6", "#f59e0b", "#ef4444", "#ec4899", "#14b8a6", "#334155"];

export function NewThemeDialog() {
  const t = useTranslations("music.admin");
  return (
    <Dialog
      title={t("newTheme")}
      trigger={(open) => (
        <Button onClick={open}>
          <Plus className="size-4" aria-hidden="true" />
          {t("newTheme")}
        </Button>
      )}
    >
      <CreateThemeForm />
    </Dialog>
  );
}

export function CreateThemeForm() {
  const t = useTranslations("music.admin");
  const form = useActionForm(createThemeAction);
  useCloseOnSuccess(form.state);
  return (
    <ActionForm form={form} className="space-y-4">
      <FormFeedback state={form.state} />
      <Field
        label={t("themeName")}
        name="name"
        required
        maxLength={80}
        placeholder={t("themeNamePlaceholder")}
        autoFocus
      />
      <TextareaField label={t("themeDescription")} name="description" maxLength={500} />
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">{t("color")}</legend>
        <div className="flex flex-wrap gap-2">
          {COLORS.map((c, i) => (
            <label key={c} className="cursor-pointer">
              <input type="radio" name="color" value={c} defaultChecked={i === 0} className="peer sr-only" />
              <span
                className="block size-9 rounded-full ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-fg peer-focus-visible:ring-2"
                style={{ background: c }}
              />
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end">
        <SubmitButton>{t("createTheme")}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function ThemeFlags({
  id,
  isActive,
  radioEnabled,
}: {
  id: string;
  isActive: boolean;
  radioEnabled: boolean;
}) {
  const t = useTranslations("music.admin");
  const [pending, start] = useTransition();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const btn = (on: boolean) =>
    cn(
      "inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium ring-1 transition-colors disabled:opacity-50",
      on ? "bg-accent-soft text-accent-text ring-accent/30" : "bg-surface text-fg-muted ring-border",
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        className={btn(isActive)}
        onClick={() => start(async () => void (await setThemeFlagAction(id, "isActive", !isActive)))}
      >
        <Power className="size-4" aria-hidden="true" />
        {isActive ? t("active") : t("inactive")}
      </button>
      <button
        type="button"
        disabled={pending}
        className={btn(radioEnabled)}
        onClick={() => start(async () => void (await setThemeFlagAction(id, "radioEnabled", !radioEnabled)))}
      >
        <Radio className="size-4" aria-hidden="true" />
        {radioEnabled ? t("radioOn") : t("radioOff")}
      </button>
      <button
        type="button"
        disabled={pending}
        className="inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium text-danger ring-1 ring-border hover:bg-danger-soft"
        onClick={() => {
          if (!window.confirm(t("deleteThemeConfirm"))) return;
          start(async () => {
            const res = await deleteThemeAction(id);
            if (res && !res.ok) setError(t("themeHasSubscribers"));
            else router.push("/admin/music");
          });
        }}
      >
        <Trash2 className="size-4" aria-hidden="true" />
        {t("delete")}
      </button>
      {error ? <p className="w-full text-sm text-danger">{error}</p> : null}
    </div>
  );
}

/** Reads the duration in the browser (no server-side audio decoding needed). */
function audioDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = "metadata";
    a.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      if (Number.isFinite(a.duration)) resolve(a.duration);
      else reject(new Error("duration"));
    };
    a.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("duration"));
    };
    a.src = url;
  });
}

type Job = {
  name: string;
  progress: number;
  state: "queued" | "uploading" | "done" | "error";
  error?: string;
};

/** Drop or pick many audio files: each is measured, then uploaded one by one with progress. */
export function TrackUploader({ themeId }: { themeId: string }) {
  const t = useTranslations("music.admin");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [drag, setDrag] = useState(false);
  const busy = jobs.some((j) => j.state === "uploading" || j.state === "queued");

  const patch = (i: number, p: Partial<Job>) =>
    setJobs((js) => js.map((j, k) => (k === i ? { ...j, ...p } : j)));

  const upload = async (files: File[]) => {
    const offset = jobs.length;
    setJobs((js) => [...js, ...files.map((f) => ({ name: f.name, progress: 0, state: "queued" as const }))]);
    for (const [k, file] of files.entries()) {
      const i = offset + k;
      patch(i, { state: "uploading" });
      try {
        const duration = await audioDuration(file);
        const fd = new FormData();
        fd.set("file", file);
        fd.set("durationSec", String(Math.round(duration)));
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", `/api/v1/admin/music/themes/${themeId}/tracks`);
          xhr.upload.onprogress = (e) => e.lengthComputable && patch(i, { progress: e.loaded / e.total });
          xhr.onload = () => {
            if (xhr.status < 300) return resolve();
            let code = "internal";
            try {
              code = JSON.parse(xhr.responseText).error ?? code;
            } catch {
              /* keep internal */
            }
            reject(new Error(code));
          };
          xhr.onerror = () => reject(new Error("network"));
          xhr.send(fd);
        });
        patch(i, { state: "done", progress: 1 });
      } catch (e) {
        const code = e instanceof Error ? e.message : "internal";
        patch(i, {
          state: "error",
          error: t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.internal"),
        });
      }
    }
    router.refresh();
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("audio/"));
          if (files.length) void upload(files);
        }}
        className={cn(
          "flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          drag
            ? "border-accent bg-accent-soft"
            : "border-border-strong hover:border-accent hover:bg-accent-soft/40",
        )}
      >
        <span className="grid size-12 place-items-center rounded-2xl bg-accent text-accent-fg">
          <Upload className="size-6" aria-hidden="true" />
        </span>
        <span className="font-semibold">{t("uploadTitle")}</span>
        <span className="text-sm text-fg-muted">{t("uploadHint")}</span>
      </button>
      <input
        ref={input}
        type="file"
        accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/ogg,audio/wav,.mp3,.m4a"
        multiple
        hidden
        disabled={busy}
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          if (files.length) void upload(files);
        }}
      />
      {jobs.length ? (
        <ul className="mt-3 space-y-2">
          {jobs.map((j, i) => (
            <li key={i} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                {j.state === "done" ? (
                  <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
                ) : j.state === "error" ? (
                  <X className="size-4 shrink-0 text-danger" aria-hidden="true" />
                ) : (
                  <Loader2 className="size-4 shrink-0 animate-spin text-fg-subtle" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate" dir="auto">
                  {j.name}
                </span>
                <span className="text-xs text-fg-subtle tabular-nums">{Math.round(j.progress * 100)}%</span>
              </div>
              {j.state === "uploading" ? (
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full bg-accent transition-all"
                    style={{ width: `${j.progress * 100}%` }}
                  />
                </div>
              ) : null}
              {j.error ? <p className="mt-1 text-xs text-danger">{j.error}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function TrackRow({
  track,
  color,
}: {
  track: {
    id: string;
    title: string;
    artist: string | null;
    durationSec: number;
    isActive: boolean;
    sizeBytes: number;
    cover: string | null;
  };
  color: string;
}) {
  const t = useTranslations("music.admin");
  const [pending, start] = useTransition();
  const [playing, setPlaying] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  return (
    <li className={cn("flex items-center gap-3 px-4 py-3", (!track.isActive || pending) && "opacity-55")}>
      <button
        type="button"
        onClick={() => {
          const a = audio.current;
          if (!a) return;
          if (a.paused) void a.play();
          else a.pause();
        }}
        aria-label={playing ? t("pause") : t("preview")}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text"
      >
        {playing ? (
          <Pause className="size-4" aria-hidden="true" />
        ) : (
          <Play className="size-4" aria-hidden="true" />
        )}
      </button>
      <audio
        ref={audio}
        src={`/api/v1/music/tracks/${track.id}`}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />
      <CoverEdit kind="track" id={track.id} src={track.cover} color={color} className="size-12" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium" dir="auto">
          {track.title}
        </p>
        <p className="truncate text-xs text-fg-subtle">
          {track.artist ? `${track.artist} · ` : ""}
          <span className="tabular-nums">{fmtDuration(track.durationSec)}</span> ·{" "}
          <span className="tabular-nums">{(track.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
        </p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => start(async () => void (await setTrackActiveAction(track.id, !track.isActive)))}
      >
        {track.isActive ? t("disable") : t("enable")}
      </Button>
      <button
        type="button"
        disabled={pending}
        aria-label={t("delete")}
        onClick={() => {
          if (window.confirm(t("deleteTrackConfirm")))
            start(async () => void (await deleteTrackAction(track.id)));
        }}
        className="grid size-9 place-items-center rounded-full text-fg-subtle hover:bg-danger-soft hover:text-danger"
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </button>
    </li>
  );
}

export function SubscriptionActions({ id, status }: { id: string; status: string }) {
  const t = useTranslations("music.admin");
  const [pending, start] = useTransition();
  if (status === "cancelled" || status === "expired") return null;
  return (
    <div className="flex gap-2">
      <Button
        size="sm"
        disabled={pending}
        onClick={() => start(async () => void (await activateSubscriptionAction(id)))}
      >
        {status === "active" ? t("extend") : t("activate")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => {
          if (window.confirm(t("cancelConfirm")))
            start(async () => void (await cancelSubscriptionAction(id)));
        }}
      >
        {t("cancel")}
      </Button>
    </div>
  );
}

/** Click the artwork to replace it (track or station). */
export function CoverEdit({
  kind,
  id,
  src,
  color,
  className,
}: {
  kind: "track" | "theme";
  id: string;
  src: string | null;
  color: string;
  className?: string;
}) {
  const t = useTranslations("music.admin");
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  return (
    <button
      type="button"
      onClick={() => input.current?.click()}
      disabled={busy}
      title={t("changeCover")}
      aria-label={t("changeCover")}
      className={cn("group relative shrink-0 overflow-hidden rounded-lg", className)}
    >
      <Cover src={src} color={color} className="size-full" rounded="rounded-lg" />
      <span
        className={cn(
          "absolute inset-0 grid place-items-center bg-black/55 text-white transition-opacity",
          busy || error ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        {busy ? (
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        ) : error ? (
          <X className="size-5 text-red-300" aria-hidden="true" />
        ) : (
          <ImagePlus className="size-5" aria-hidden="true" />
        )}
      </span>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          setBusy(true);
          setError(false);
          const fd = new FormData();
          fd.set("file", file);
          fd.set("kind", kind);
          fd.set("id", id);
          const res = await fetch("/api/v1/admin/music/covers", { method: "POST", body: fd }).catch(
            () => null,
          );
          setBusy(false);
          if (res?.ok) router.refresh();
          else setError(true);
        }}
      />
    </button>
  );
}
