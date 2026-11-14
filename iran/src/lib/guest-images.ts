/**
 * Photos of the guest portal (room QR) for what hotels do not photograph themselves: the wellness
 * services by kind and the minibar's items by name. Freely licensed, in public/guest (credits in
 * public/guest/CREDITS.md).
 */

const SPA = new Set(["spa", "sauna", "pool", "massage", "hammam", "gym", "beauty"]);

/** A photo for a wellness service of this kind, if there is one. */
export function spaImage(kind: string): string | null {
  return SPA.has(kind) ? `/guest/spa/${kind}.jpg` : null;
}

/** Words that name each minibar item, in Persian, Arabic, English and French. */
const MINIBAR: [file: string, words: string[]][] = [
  ["water", ["آب معدنی", "آب", "ماء", "water", "eau"]],
  ["juice", ["آبمیوه", "عصیر", "عصير", "juice", "jus"]],
  ["beer", ["ماءالشعیر", "ماء الشعير", "beer", "bière", "biere", "malt"]],
  ["soda", ["نوشابه", "کولا", "مشروب غازي", "soda", "cola", "soft"]],
  ["nuts", ["آجیل", "پسته", "بادام", "مكسرات", "nuts", "noix", "pistach", "almond"]],
  ["chocolate", ["شکلات", "شوكولا", "chocolate", "chocolat"]],
  ["chips", ["چیپس", "رقائق", "chips", "crisps"]],
  ["biscuit", ["بیسکویت", "کلوچه", "بسكويت", "biscuit", "cookie", "gâteau"]],
];

/** A photo for a minibar item, from its name (the minibar itself when nothing matches). */
export function minibarImage(name: string): string {
  const n = name.toLowerCase();
  // Longest words first: "ماءالشعیر" before "آب", "آبمیوه" before "آب".
  let best: { file: string; len: number } | null = null;
  for (const [file, words] of MINIBAR)
    for (const w of words)
      if (n.includes(w.toLowerCase()) && (!best || w.length > best.len)) best = { file, len: w.length };
  return `/guest/minibar/${best?.file ?? "minibar"}.jpg`;
}
