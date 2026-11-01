/**
 * Public restaurant directory (spotifood.ir/restaurants): Iranian cities with their
 * centre coordinates, and the themes a restaurant can be found by.
 */

export type City = { key: string; fa: string; en: string; lat: number; lng: number };

/** Province capitals and the main tourist cities, largest first. */
export const IRAN_CITIES: readonly City[] = [
  { key: "tehran", fa: "تهران", en: "Tehran", lat: 35.6892, lng: 51.389 },
  { key: "mashhad", fa: "مشهد", en: "Mashhad", lat: 36.2605, lng: 59.6168 },
  { key: "isfahan", fa: "اصفهان", en: "Isfahan", lat: 32.6546, lng: 51.668 },
  { key: "karaj", fa: "کرج", en: "Karaj", lat: 35.84, lng: 50.9391 },
  { key: "shiraz", fa: "شیراز", en: "Shiraz", lat: 29.5918, lng: 52.5837 },
  { key: "tabriz", fa: "تبریز", en: "Tabriz", lat: 38.08, lng: 46.2919 },
  { key: "qom", fa: "قم", en: "Qom", lat: 34.6416, lng: 50.8746 },
  { key: "ahvaz", fa: "اهواز", en: "Ahvaz", lat: 31.3183, lng: 48.6706 },
  { key: "kermanshah", fa: "کرمانشاه", en: "Kermanshah", lat: 34.3142, lng: 47.065 },
  { key: "urmia", fa: "ارومیه", en: "Urmia", lat: 37.5527, lng: 45.0761 },
  { key: "rasht", fa: "رشت", en: "Rasht", lat: 37.2808, lng: 49.5832 },
  { key: "zahedan", fa: "زاهدان", en: "Zahedan", lat: 29.4963, lng: 60.8629 },
  { key: "hamedan", fa: "همدان", en: "Hamedan", lat: 34.7983, lng: 48.5146 },
  { key: "kerman", fa: "کرمان", en: "Kerman", lat: 30.2839, lng: 57.0834 },
  { key: "yazd", fa: "یزد", en: "Yazd", lat: 31.8974, lng: 54.3569 },
  { key: "ardabil", fa: "اردبیل", en: "Ardabil", lat: 38.2498, lng: 48.2933 },
  { key: "bandar-abbas", fa: "بندرعباس", en: "Bandar Abbas", lat: 27.1832, lng: 56.2666 },
  { key: "arak", fa: "اراک", en: "Arak", lat: 34.0917, lng: 49.6892 },
  { key: "zanjan", fa: "زنجان", en: "Zanjan", lat: 36.6736, lng: 48.4787 },
  { key: "sanandaj", fa: "سنندج", en: "Sanandaj", lat: 35.3219, lng: 46.9862 },
  { key: "qazvin", fa: "قزوین", en: "Qazvin", lat: 36.2688, lng: 50.0041 },
  { key: "khorramabad", fa: "خرم‌آباد", en: "Khorramabad", lat: 33.4878, lng: 48.3558 },
  { key: "gorgan", fa: "گرگان", en: "Gorgan", lat: 36.8456, lng: 54.4393 },
  { key: "sari", fa: "ساری", en: "Sari", lat: 36.5633, lng: 53.0601 },
  { key: "kashan", fa: "کاشان", en: "Kashan", lat: 33.985, lng: 51.41 },
  { key: "babol", fa: "بابل", en: "Babol", lat: 36.5513, lng: 52.679 },
  { key: "amol", fa: "آمل", en: "Amol", lat: 36.4696, lng: 52.3507 },
  { key: "neyshabur", fa: "نیشابور", en: "Neyshabur", lat: 36.2133, lng: 58.7958 },
  { key: "dezful", fa: "دزفول", en: "Dezful", lat: 32.3811, lng: 48.4058 },
  { key: "abadan", fa: "آبادان", en: "Abadan", lat: 30.3392, lng: 48.3043 },
  { key: "bojnurd", fa: "بجنورد", en: "Bojnurd", lat: 37.4747, lng: 57.329 },
  { key: "bushehr", fa: "بوشهر", en: "Bushehr", lat: 28.9234, lng: 50.8203 },
  { key: "birjand", fa: "بیرجند", en: "Birjand", lat: 32.8663, lng: 59.2211 },
  { key: "ilam", fa: "ایلام", en: "Ilam", lat: 33.6374, lng: 46.4227 },
  { key: "shahrekord", fa: "شهرکرد", en: "Shahrekord", lat: 32.3256, lng: 50.8644 },
  { key: "yasuj", fa: "یاسوج", en: "Yasuj", lat: 30.6682, lng: 51.588 },
  { key: "semnan", fa: "سمنان", en: "Semnan", lat: 35.5769, lng: 53.3953 },
  { key: "kish", fa: "کیش", en: "Kish", lat: 26.5578, lng: 53.98 },
  { key: "qeshm", fa: "قشم", en: "Qeshm", lat: 26.9581, lng: 56.2719 },
  { key: "lahijan", fa: "لاهیجان", en: "Lahijan", lat: 37.2072, lng: 50.0039 },
  { key: "bandar-anzali", fa: "بندر انزلی", en: "Bandar Anzali", lat: 37.4727, lng: 49.4622 },
  { key: "chalus", fa: "چالوس", en: "Chalus", lat: 36.655, lng: 51.4204 },
  { key: "ramsar", fa: "رامسر", en: "Ramsar", lat: 36.9031, lng: 50.6583 },
];

/** Themes a guest filters by; a restaurant picks several. Labels: messages `directory.cuisine.*`. */
export const CUISINES = [
  "iranian",
  "kebab",
  "traditional",
  "cafe",
  "fastfood",
  "pizza",
  "steak",
  "seafood",
  "asian",
  "international",
  "breakfast",
  "dessert",
  "vegetarian",
  "fine",
  "family",
  "garden",
] as const;
export type Cuisine = (typeof CUISINES)[number];
export const isCuisine = (v: unknown): v is Cuisine => CUISINES.includes(v as Cuisine);

/** Persian spelling variants (Arabic ي/ك, zero-width joiners, spaces) folded for matching. */
function fold(s: string) {
  return s
    .trim()
    .toLowerCase()
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[‌\s-]+/g, "");
}

/** The directory city of a free-text `restaurants.city` (fa or en spelling), if it is one of ours. */
export function cityOf(text: string | null | undefined): City | null {
  if (!text) return null;
  const f = fold(text);
  return (
    IRAN_CITIES.find((c) => fold(c.fa) === f || fold(c.en) === f || c.key.replace(/-/g, "") === f) ?? null
  );
}

export const cityByKey = (key: string | null | undefined) => IRAN_CITIES.find((c) => c.key === key) ?? null;

/** Great-circle distance in kilometres. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Radius choices of the "near me" search, in km. */
export const NEAR_RADII = [2, 5, 10, 25] as const;
