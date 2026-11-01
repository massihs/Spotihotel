import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RadioApp } from "@/components/music/radio-app";
import { db } from "@/server/db/client";
import { listStations } from "@/server/modules/music/service";

export async function generateMetadata({ params }: PageProps<"/[locale]/radio">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "music.radio" });
  return { title: t("pageTitle") };
}

export default async function RadioPage({ params, searchParams }: PageProps<"/[locale]/radio">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<div className="min-h-dvh bg-black" />}>
      <Stations searchParams={searchParams} />
    </Suspense>
  );
}

async function Stations({ searchParams }: Pick<PageProps<"/[locale]/radio">, "searchParams">) {
  const [t, stations, sp] = await Promise.all([
    getTranslations("music.radio"),
    listStations(db),
    searchParams,
  ]);
  if (!stations.length)
    return (
      <div className="grid min-h-dvh place-items-center bg-black px-6 text-center text-white/70">
        {t("noStations")}
      </div>
    );
  const current = stations.find((s) => s.slug === sp.s);
  const v = sp.v;
  const initialView = current ? "station" : v === "search" || v === "liked" ? v : "home";
  return (
    <RadioApp
      stations={stations.map(({ id: _id, createdAt: _c, ...s }) => s)}
      initialSlug={(current ?? stations[0]!).slug}
      initialView={initialView}
    />
  );
}
