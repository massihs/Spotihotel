/**
 * The guest concierge's understanding: which need a message points at, from words in Persian, Arabic,
 * English and French (no outside AI: works offline and in Iran).
 */

export type Intent =
  "wifi" | "checkout" | "food" | "spa" | "minibar" | "bill" | "clean" | "tip" | "prayer" | "help";

/** Words that point at each need, in Persian, Arabic, English and French (lower case, no ZWNJ). */
const WORDS: Record<Exclude<Intent, "help">, string[]> = {
  wifi: [
    "وای فای",
    "وایفای",
    "وای‌فای",
    "اینترنت",
    "رمز",
    "wifi",
    "wi-fi",
    "internet",
    "password",
    "mot de passe",
    "واي فاي",
    "انترنت",
    "كلمة",
  ],
  checkout: [
    "خروج",
    "تخلیه",
    "تحویل اتاق",
    "checkout",
    "check-out",
    "check out",
    "départ",
    "depart",
    "leave",
    "مغادرة",
    "الخروج",
  ],
  food: [
    "صبحانه",
    "غذا",
    "منو",
    "گرسنه",
    "شام",
    "ناهار",
    "سفارش",
    "چای",
    "قهوه",
    "food",
    "breakfast",
    "menu",
    "hungry",
    "dinner",
    "lunch",
    "coffee",
    "petit",
    "faim",
    "manger",
    "repas",
    "طعام",
    "فطور",
    "عشاء",
    "جائع",
    "قهوة",
  ],
  spa: [
    "ماساژ",
    "سونا",
    "استخر",
    "اسپا",
    "جکوزی",
    "باشگاه",
    "massage",
    "spa",
    "pool",
    "sauna",
    "gym",
    "piscine",
    "مساج",
    "مسبح",
    "ساونا",
  ],
  minibar: [
    "مینی بار",
    "مینیبار",
    "یخچال",
    "نوشیدنی",
    "minibar",
    "mini-bar",
    "fridge",
    "drink",
    "boisson",
    "ثلاجة",
    "مشروب",
  ],
  bill: [
    "صورتحساب",
    "صورت حساب",
    "فاکتور",
    "حساب",
    "پرداخت",
    "bill",
    "invoice",
    "pay",
    "facture",
    "payer",
    "فاتورة",
    "الحساب",
    "دفع",
  ],
  clean: [
    "حوله",
    "نظافت",
    "تمیز",
    "ملحفه",
    "پتو",
    "بالش",
    "شامپو",
    "صابون",
    "خراب",
    "تعمیر",
    "towel",
    "clean",
    "pillow",
    "blanket",
    "broken",
    "repair",
    "serviette",
    "ménage",
    "menage",
    "oreiller",
    "منشفة",
    "تنظيف",
    "وسادة",
    "بطانية",
  ],
  tip: ["انعام", "tip", "pourboire", "بقشيش", "إكرامية"],
  prayer: [
    "اذان",
    "نماز",
    "قبله",
    "سحری",
    "افطار",
    "prayer",
    "qibla",
    "iftar",
    "prière",
    "صلاة",
    "أذان",
    "سحور",
    "إفطار",
  ],
};

export function intentOf(text: string): Intent {
  const s = text.toLowerCase().replace(/‌/g, " ").replace(/\s+/g, " ");
  const norm = s.replace(/ي/g, "ی").replace(/ك/g, "ک");
  let best: Intent = "help";
  let score = 0;
  for (const [intent, words] of Object.entries(WORDS) as [Intent, string[]][]) {
    const n = words.filter((w) =>
      norm.includes(w.replace(/‌/g, " ").replace(/ي/g, "ی").replace(/ك/g, "ک")),
    ).length;
    if (n > score) {
      score = n;
      best = intent;
    }
  }
  return best;
}
