/**
 * The support assistant's matching: no external AI, so it works anywhere. A question is
 * normalized (Arabic/Persian letter forms, digits, half-spaces, case, punctuation), then each
 * help article is scored by the keywords and title words it contains.
 */

const ARABIC_TO_PERSIAN: Record<string, string> = {
  ي: "ی",
  ى: "ی",
  ك: "ک",
  ة: "ه",
  أ: "ا",
  إ: "ا",
  آ: "ا",
  ؤ: "و",
};

export function normalize(text: string): string {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      // Latin accents and Arabic diacritics (harakat, tatweel).
      .replace(/[̀-ًͯ-ٰٟـ]/g, "")
      .replace(/[يىكةأإآؤ]/g, (c) => ARABIC_TO_PERSIAN[c] ?? c)
      .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
      // Half-space (ZWNJ) and punctuation become spaces.
      .replace(/[‌‏‎]/g, " ")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .replace(/\s+/g, " ")
  );
}

export type MatchableArticle = { slug: string; keywords: string; title: Record<string, string> };

/** Words too common to mean anything on their own. */
const STOP = new Set(
  "چطور چگونه چرا کجا چه کی را به از در با که این آن من ما است هست میخواهم می خواهم how what why where the a an to is my i do can comment pourquoi le la les un une de des mon ma je est كيف ماذا لماذا اين في من على".split(
    " ",
  ),
);

/**
 * Articles ranked for a question, best first; only those above `min` points. A keyword phrase
 * found whole scores by its length (a precise phrase beats a vague word); title words add a little.
 */
/**
 * Arabic attaches small words to the next one ("بإغلاق" = "by closing"): each such word is followed
 * by its bare form, so "باغلاق الیوم" still contains the phrase "اغلاق الیوم".
 */
function withBareForms(text: string) {
  return text
    .split(" ")
    .map((w) => {
      const bare = /^[\u0600-\u06ff]/.test(w) && w.length > 4 && /^[بولف]/.test(w) ? w.slice(1) : null;
      return bare ? `${w} ${bare}` : w;
    })
    .join(" ");
}

export function rankArticles<T extends MatchableArticle>(question: string, articles: T[], min = 3): T[] {
  const q = ` ${withBareForms(normalize(question))} `;
  if (q.trim().length < 2) return [];
  const words = new Set(
    q
      .trim()
      .split(" ")
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
  const scored = articles.map((a) => {
    let score = 0;
    for (const raw of a.keywords.split(",")) {
      const k = normalize(raw);
      if (!k) continue;
      // Whole phrase, or (for one word) as the start of a word: "چاپگر" matches "چاپگرم".
      if (q.includes(` ${k} `) || (!k.includes(" ") && k.length >= 4 && q.includes(` ${k}`)))
        score += 2 + Math.min(k.length, 12) / 3;
    }
    for (const title of Object.values(a.title))
      for (const w of normalize(title).split(" ")) if (w.length > 2 && words.has(w)) score += 1;
    return { a, score };
  });
  return scored
    .filter((s) => s.score >= min)
    .sort((x, y) => y.score - x.score)
    .map((s) => s.a);
}

/** "Talk to a person" in any of the four languages, typed instead of tapped. */
export function wantsHuman(question: string): boolean {
  const q = ` ${normalize(question)} `;
  return [
    "اپراتور",
    "پشتیبان",
    "کارشناس",
    "انسان",
    "با یک نفر",
    "تماس بگیرید",
    "human",
    "agent",
    "operator",
    "real person",
    "humain",
    "conseiller",
    "quelqu un",
    "موظف",
    "شخص حقيقي",
  ].some((k) => q.includes(` ${normalize(k)}`));
}
