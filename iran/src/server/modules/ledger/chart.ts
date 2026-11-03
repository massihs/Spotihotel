import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { ledgerAccounts, ledgerSettings } from "@/server/db/schema";

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";
type Names = { fr: string; en: string; fa: string; ar: string };

/**
 * Default chart of accounts of a hotel, laid out like USALI (rooms, food & beverage, other operated
 * departments, undistributed expenses). Accounts with a `key` are used by the automatic postings;
 * the hotel can rename them, add sub-accounts and its own accounts.
 */
export const DEFAULT_CHART: {
  code: string;
  key?: string;
  type: AccountType;
  reconcilable?: boolean;
  names: Names;
}[] = [
  // Assets
  {
    code: "1000",
    key: "cash",
    type: "asset",
    reconcilable: true,
    names: { fr: "Caisse", en: "Cash on hand", fa: "صندوق", ar: "الصندوق" },
  },
  {
    code: "1010",
    key: "bank",
    type: "asset",
    reconcilable: true,
    names: { fr: "Banque", en: "Bank", fa: "بانک", ar: "البنك" },
  },
  {
    code: "1020",
    key: "card_clearing",
    type: "asset",
    reconcilable: true,
    names: {
      fr: "Cartes bancaires à encaisser",
      en: "Card payments clearing",
      fa: "دریافتی‌های کارتخوان",
      ar: "مدفوعات البطاقات قيد التحصيل",
    },
  },
  {
    code: "1030",
    key: "online_clearing",
    type: "asset",
    reconcilable: true,
    names: {
      fr: "Paiements en ligne à encaisser",
      en: "Online payments clearing",
      fa: "دریافتی‌های درگاه آنلاین",
      ar: "المدفوعات الإلكترونية قيد التحصيل",
    },
  },
  {
    code: "1100",
    key: "guest_ledger",
    type: "asset",
    names: {
      fr: "Clients hébergés (notes en cours)",
      en: "Guest ledger (in-house folios)",
      fa: "حساب مهمانان مقیم",
      ar: "حسابات النزلاء المقيمين",
    },
  },
  {
    code: "1110",
    key: "city_ledger",
    type: "asset",
    names: {
      fr: "Clients débiteurs (sociétés, agences)",
      en: "City ledger (companies, agencies)",
      fa: "بدهکاران (شرکت‌ها و آژانس‌ها)",
      ar: "الذمم المدينة (الشركات والوكالات)",
    },
  },
  {
    code: "1200",
    key: "inventory",
    type: "asset",
    names: { fr: "Stocks", en: "Inventory", fa: "موجودی انبار", ar: "المخزون" },
  },
  {
    code: "1500",
    type: "asset",
    names: { fr: "Immobilisations", en: "Fixed assets", fa: "دارایی‌های ثابت", ar: "الأصول الثابتة" },
  },
  // Liabilities
  {
    code: "2000",
    key: "accounts_payable",
    type: "liability",
    names: { fr: "Fournisseurs", en: "Accounts payable", fa: "حساب‌های پرداختنی", ar: "الذمم الدائنة" },
  },
  {
    code: "2100",
    key: "vat_payable",
    type: "liability",
    names: {
      fr: "TVA collectée",
      en: "VAT payable",
      fa: "مالیات بر ارزش افزوده پرداختنی",
      ar: "ضريبة القيمة المضافة المستحقة",
    },
  },
  {
    code: "2110",
    key: "city_tax_payable",
    type: "liability",
    names: {
      fr: "Taxe de séjour à reverser",
      en: "City tax payable",
      fa: "عوارض اقامت پرداختنی",
      ar: "ضريبة الإقامة المستحقة",
    },
  },
  {
    code: "2200",
    key: "advance_deposits",
    type: "liability",
    names: {
      fr: "Acomptes clients reçus",
      en: "Advance deposits",
      fa: "پیش‌دریافت از مهمانان",
      ar: "العربون المستلم",
    },
  },
  {
    code: "2300",
    key: "salaries_payable",
    type: "liability",
    names: { fr: "Salaires à payer", en: "Salaries payable", fa: "حقوق پرداختنی", ar: "الرواتب المستحقة" },
  },
  {
    code: "2400",
    key: "commissions_payable",
    type: "liability",
    names: {
      fr: "Commissions agences à payer",
      en: "Agency commissions payable",
      fa: "کمیسیون آژانس‌ها پرداختنی",
      ar: "عمولات الوكالات المستحقة",
    },
  },
  { code: "2500", type: "liability", names: { fr: "Emprunts", en: "Loans", fa: "وام‌ها", ar: "القروض" } },
  // Equity
  {
    code: "3000",
    key: "equity",
    type: "equity",
    names: { fr: "Capital", en: "Owner's equity", fa: "سرمایه", ar: "رأس المال" },
  },
  {
    code: "3100",
    key: "retained_earnings",
    type: "equity",
    names: { fr: "Résultats reportés", en: "Retained earnings", fa: "سود انباشته", ar: "الأرباح المحتجزة" },
  },
  // Revenue (operated departments)
  {
    code: "4000",
    key: "revenue_room",
    type: "revenue",
    names: { fr: "Hébergement", en: "Rooms revenue", fa: "درآمد اقامت", ar: "إيرادات الغرف" },
  },
  {
    code: "4100",
    key: "revenue_fnb",
    type: "revenue",
    names: {
      fr: "Restauration et room service",
      en: "Food & beverage revenue",
      fa: "درآمد رستوران و سرویس اتاق",
      ar: "إيرادات الأطعمة والمشروبات",
    },
  },
  {
    code: "4200",
    key: "revenue_minibar",
    type: "revenue",
    names: { fr: "Minibar", en: "Minibar revenue", fa: "درآمد مینی‌بار", ar: "إيرادات الميني بار" },
  },
  {
    code: "4300",
    key: "revenue_spa",
    type: "revenue",
    names: {
      fr: "Spa et bien-être",
      en: "Spa & wellness revenue",
      fa: "درآمد اسپا و تندرستی",
      ar: "إيرادات السبا والعافية",
    },
  },
  {
    code: "4400",
    key: "revenue_other",
    type: "revenue",
    names: {
      fr: "Autres produits (blanchisserie, parking, transferts…)",
      en: "Other operated departments",
      fa: "سایر درآمدها (لباسشویی، پارکینگ، ترانسفر…)",
      ar: "إيرادات أخرى (غسيل، مواقف، نقل…)",
    },
  },
  // Expenses
  {
    code: "5000",
    key: "cogs",
    type: "expense",
    names: {
      fr: "Achats consommés (coût des ventes)",
      en: "Cost of sales",
      fa: "بهای تمام‌شده فروش",
      ar: "تكلفة المبيعات",
    },
  },
  {
    code: "6000",
    key: "expense_rent",
    type: "expense",
    names: { fr: "Loyer", en: "Rent", fa: "اجاره", ar: "الإيجار" },
  },
  {
    code: "6100",
    key: "expense_salaries",
    type: "expense",
    names: { fr: "Salaires et charges", en: "Payroll", fa: "حقوق و دستمزد", ar: "الرواتب والأجور" },
  },
  {
    code: "6200",
    key: "expense_utilities",
    type: "expense",
    names: { fr: "Énergie et fluides", en: "Utilities", fa: "آب، برق و گاز", ar: "المرافق" },
  },
  {
    code: "6300",
    key: "expense_supplies",
    type: "expense",
    names: {
      fr: "Fournitures et produits d'accueil",
      en: "Supplies & amenities",
      fa: "ملزومات و اقلام پذیرایی",
      ar: "المستلزمات",
    },
  },
  {
    code: "6400",
    key: "expense_marketing",
    type: "expense",
    names: {
      fr: "Marketing et ventes",
      en: "Sales & marketing",
      fa: "بازاریابی و فروش",
      ar: "التسويق والمبيعات",
    },
  },
  {
    code: "6500",
    key: "expense_maintenance",
    type: "expense",
    names: {
      fr: "Entretien et réparations",
      en: "Property operation & maintenance",
      fa: "نگهداری و تعمیرات",
      ar: "الصيانة والإصلاحات",
    },
  },
  {
    code: "6600",
    key: "expense_taxes",
    type: "expense",
    names: { fr: "Impôts et taxes", en: "Taxes & licences", fa: "مالیات و عوارض", ar: "الضرائب والرسوم" },
  },
  {
    code: "6700",
    key: "expense_commissions",
    type: "expense",
    names: {
      fr: "Commissions agences et OTA",
      en: "Agency & OTA commissions",
      fa: "کمیسیون آژانس‌ها",
      ar: "عمولات الوكالات",
    },
  },
  {
    code: "6800",
    key: "expense_bank_fees",
    type: "expense",
    names: { fr: "Frais bancaires", en: "Bank & card fees", fa: "کارمزد بانکی", ar: "الرسوم المصرفية" },
  },
  {
    code: "6900",
    key: "expense_other",
    type: "expense",
    names: { fr: "Autres charges", en: "Other expenses", fa: "سایر هزینه‌ها", ar: "مصاريف أخرى" },
  },
];

export type SystemKey = NonNullable<(typeof DEFAULT_CHART)[number]["key"]>;

const pickName = (n: Names, locale: string) => n[(locale in n ? locale : "en") as keyof Names];

/** Creates the default chart and ledger settings for a hotel that has none (idempotent). */
export async function ensureChart(db: DbOrTx, restaurantId: string, locale: string) {
  await db.insert(ledgerSettings).values({ restaurantId }).onConflictDoNothing();
  const existing = await db
    .select({ code: ledgerAccounts.code, key: ledgerAccounts.systemKey })
    .from(ledgerAccounts)
    .where(eq(ledgerAccounts.restaurantId, restaurantId));
  const codes = new Set(existing.map((e) => e.code));
  const keys = new Set(existing.map((e) => e.key));
  const missing = DEFAULT_CHART.filter(
    (a) => !(a.key ? keys.has(a.key) : codes.has(a.code)) && !codes.has(a.code),
  );
  if (missing.length)
    await db
      .insert(ledgerAccounts)
      .values(
        missing.map((a) => ({
          restaurantId,
          code: a.code,
          name: pickName(a.names, locale),
          type: a.type,
          systemKey: a.key ?? null,
          reconcilable: a.reconcilable ?? false,
        })),
      )
      .onConflictDoNothing();
}

/** System accounts by key (id lookup for the automatic postings). */
export async function systemAccounts(db: DbOrTx, restaurantId: string) {
  const rows = await db
    .select({ id: ledgerAccounts.id, key: ledgerAccounts.systemKey })
    .from(ledgerAccounts)
    .where(and(eq(ledgerAccounts.restaurantId, restaurantId)));
  const map = new Map<string, string>();
  for (const r of rows) if (r.key) map.set(r.key, r.id);
  return (key: SystemKey) => {
    const id = map.get(key);
    if (!id) throw new Error(`ledger account missing: ${key}`);
    return id;
  };
}

/** Revenue account and USALI department of a folio department. */
export function revenueOf(department: string): { key: SystemKey; dept: string } {
  switch (department) {
    case "room":
      return { key: "revenue_room", dept: "rooms" };
    case "fnb":
    case "room_service":
      return { key: "revenue_fnb", dept: "fnb" };
    case "minibar":
      return { key: "revenue_minibar", dept: "minibar" };
    case "spa":
      return { key: "revenue_spa", dept: "spa" };
    case "city_tax":
      return { key: "city_tax_payable", dept: "rooms" };
    default:
      return { key: "revenue_other", dept: "other" };
  }
}

/** Cash / bank account a payment method lands in. */
export function moneyAccountOf(method: string | null): SystemKey {
  switch (method) {
    case "cash":
      return "cash";
    case "card":
    case "on_site_terminal":
      return "card_clearing";
    case "online":
    case "stripe":
    case "zarinpal":
    case "mock_online":
      return "online_clearing";
    default:
      return "bank";
  }
}
