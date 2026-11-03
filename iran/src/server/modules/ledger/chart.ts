import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "@/server/db/client";
import { ledgerAccounts, ledgerSettings } from "@/server/db/schema";
import { EDITION } from "@/config/edition";

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

DEFAULT_CHART.splice(4, 0, {
  code: "1040",
  key: "cheques_receivable",
  type: "asset",
  names: {
    fr: "Chèques à encaisser",
    en: "Cheques receivable",
    fa: "اسناد دریافتنی (چک)",
    ar: "شيكات برسم التحصيل",
  },
});

type Entry = { code: string; key?: string; type: AccountType; reconcilable?: boolean; names: Names };
const n = (fa: string, en: string, ar: string): Names => ({ fa, en, ar, fr: en });

/**
 * Chart of the Iran edition: the usual Iranian layout (group / general ledger "کل" codes, then
 * subsidiary "معین" accounts), Persian names, and the accounts Iranian hotels keep: cheques
 * received and issued (اسناد دریافتنی / پرداختنی), social insurance and payroll tax, legal reserve.
 * Companies and agencies are the detail level (تفصیلی) of the receivables.
 */
export const IRAN_CHART: Entry[] = [
  // ۱ دارایی‌های جاری
  {
    code: "1101",
    key: "cash",
    type: "asset",
    reconcilable: true,
    names: n("صندوق", "Cash on hand", "الصندوق"),
  },
  {
    code: "1102",
    key: "bank",
    type: "asset",
    reconcilable: true,
    names: n("موجودی نزد بانک‌ها", "Bank", "البنك"),
  },
  {
    code: "1103",
    key: "card_clearing",
    type: "asset",
    reconcilable: true,
    names: n("وجوه در راه کارتخوان‌ها", "Card terminals clearing", "مدفوعات أجهزة البطاقات"),
  },
  {
    code: "1104",
    key: "online_clearing",
    type: "asset",
    reconcilable: true,
    names: n("وجوه در راه درگاه اینترنتی", "Online gateway clearing", "مدفوعات البوابة الإلكترونية"),
  },
  {
    code: "1201",
    key: "guest_ledger",
    type: "asset",
    names: n("حساب‌های دریافتنی - مهمانان مقیم", "Receivables - guests in house", "ذمم النزلاء المقيمين"),
  },
  {
    code: "1202",
    key: "city_ledger",
    type: "asset",
    names: n(
      "حساب‌های دریافتنی - شرکت‌ها و آژانس‌ها",
      "Receivables - companies and agencies",
      "ذمم الشركات والوكالات",
    ),
  },
  {
    code: "1203",
    key: "cheques_receivable",
    type: "asset",
    names: n("اسناد دریافتنی (چک)", "Cheques receivable", "شيكات برسم التحصيل"),
  },
  { code: "1301", key: "inventory", type: "asset", names: n("موجودی کالا و انبار", "Inventory", "المخزون") },
  { code: "1401", type: "asset", names: n("پیش‌پرداخت‌ها", "Prepayments", "المدفوعات المقدمة") },
  // ۱۵ دارایی‌های غیرجاری
  { code: "1501", type: "asset", names: n("دارایی‌های ثابت مشهود", "Fixed assets", "الأصول الثابتة") },
  {
    code: "1502",
    type: "asset",
    names: n("استهلاک انباشته (کاهنده)", "Accumulated depreciation", "مجمع الإهلاك"),
  },
  // ۲ بدهی‌ها
  {
    code: "2101",
    key: "accounts_payable",
    type: "liability",
    names: n("حساب‌های پرداختنی تجاری", "Trade payables", "الذمم الدائنة"),
  },
  {
    code: "2102",
    type: "liability",
    names: n("اسناد پرداختنی (چک)", "Cheques payable", "شيكات مستحقة الدفع"),
  },
  {
    code: "2201",
    key: "vat_payable",
    type: "liability",
    names: n("مالیات و عوارض ارزش افزوده پرداختنی", "VAT payable", "ضريبة القيمة المضافة المستحقة"),
  },
  {
    code: "2202",
    key: "city_tax_payable",
    type: "liability",
    names: n("عوارض پرداختنی", "Levies payable", "الرسوم المستحقة"),
  },
  {
    code: "2203",
    type: "liability",
    names: n("مالیات عملکرد پرداختنی", "Income tax payable", "ضريبة الدخل المستحقة"),
  },
  {
    code: "2301",
    key: "advance_deposits",
    type: "liability",
    names: n("پیش‌دریافت از مهمانان", "Advance deposits", "العربون المستلم"),
  },
  {
    code: "2401",
    key: "salaries_payable",
    type: "liability",
    names: n("حقوق و دستمزد پرداختنی", "Salaries payable", "الرواتب المستحقة"),
  },
  {
    code: "2402",
    type: "liability",
    names: n("حق بیمه تأمین اجتماعی پرداختنی", "Social insurance payable", "التأمينات الاجتماعية المستحقة"),
  },
  {
    code: "2403",
    type: "liability",
    names: n("مالیات حقوق پرداختنی", "Payroll tax payable", "ضريبة الرواتب المستحقة"),
  },
  {
    code: "2501",
    key: "commissions_payable",
    type: "liability",
    names: n("کمیسیون آژانس‌ها پرداختنی", "Agency commissions payable", "عمولات الوكالات المستحقة"),
  },
  { code: "2601", type: "liability", names: n("تسهیلات مالی دریافتی", "Bank loans", "القروض") },
  // ۳ حقوق مالکانه
  { code: "3101", key: "equity", type: "equity", names: n("سرمایه", "Capital", "رأس المال") },
  { code: "3201", type: "equity", names: n("اندوخته قانونی", "Legal reserve", "الاحتياطي القانوني") },
  {
    code: "3301",
    key: "retained_earnings",
    type: "equity",
    names: n("سود (زیان) انباشته", "Retained earnings", "الأرباح المحتجزة"),
  },
  // ۴ درآمدها
  {
    code: "4101",
    key: "revenue_room",
    type: "revenue",
    names: n("درآمد اقامت (اتاق)", "Rooms revenue", "إيرادات الغرف"),
  },
  {
    code: "4102",
    key: "revenue_fnb",
    type: "revenue",
    names: n("درآمد رستوران و سرویس اتاق", "Food & beverage revenue", "إيرادات الأطعمة والمشروبات"),
  },
  {
    code: "4103",
    key: "revenue_minibar",
    type: "revenue",
    names: n("درآمد مینی‌بار", "Minibar revenue", "إيرادات الميني بار"),
  },
  {
    code: "4104",
    key: "revenue_spa",
    type: "revenue",
    names: n("درآمد اسپا، استخر و ماساژ", "Spa & wellness revenue", "إيرادات السبا"),
  },
  {
    code: "4105",
    key: "revenue_other",
    type: "revenue",
    names: n("سایر درآمدهای عملیاتی", "Other operating revenue", "إيرادات تشغيلية أخرى"),
  },
  {
    code: "4201",
    type: "revenue",
    names: n("درآمدهای غیرعملیاتی", "Non-operating income", "إيرادات غير تشغيلية"),
  },
  // ۵ بهای تمام‌شده
  {
    code: "5101",
    key: "cogs",
    type: "expense",
    names: n("بهای تمام‌شده مواد مصرفی", "Cost of sales", "تكلفة المبيعات"),
  },
  // ۶ هزینه‌ها
  {
    code: "6101",
    key: "expense_salaries",
    type: "expense",
    names: n("حقوق و دستمزد", "Payroll", "الرواتب والأجور"),
  },
  {
    code: "6102",
    type: "expense",
    names: n("حق بیمه سهم کارفرما", "Employer social insurance", "حصة صاحب العمل في التأمين"),
  },
  { code: "6201", key: "expense_rent", type: "expense", names: n("اجاره", "Rent", "الإيجار") },
  {
    code: "6202",
    key: "expense_utilities",
    type: "expense",
    names: n("آب، برق، گاز و تلفن", "Utilities", "المرافق"),
  },
  {
    code: "6203",
    key: "expense_supplies",
    type: "expense",
    names: n("ملزومات و اقلام پذیرایی", "Supplies & amenities", "المستلزمات"),
  },
  {
    code: "6204",
    key: "expense_marketing",
    type: "expense",
    names: n("تبلیغات و بازاریابی", "Marketing", "التسويق"),
  },
  {
    code: "6205",
    key: "expense_maintenance",
    type: "expense",
    names: n("تعمیر و نگهداری", "Maintenance", "الصيانة"),
  },
  {
    code: "6206",
    key: "expense_taxes",
    type: "expense",
    names: n("مالیات و عوارض", "Taxes & levies", "الضرائب والرسوم"),
  },
  {
    code: "6207",
    key: "expense_commissions",
    type: "expense",
    names: n("کمیسیون آژانس‌ها و سامانه‌های رزرو", "OTA & agency commissions", "عمولات الوكالات"),
  },
  {
    code: "6208",
    key: "expense_bank_fees",
    type: "expense",
    names: n("کارمزد بانکی", "Bank fees", "الرسوم المصرفية"),
  },
  { code: "6301", type: "expense", names: n("هزینه استهلاک", "Depreciation", "الإهلاك") },
  {
    code: "6901",
    key: "expense_other",
    type: "expense",
    names: n("سایر هزینه‌ها", "Other expenses", "مصاريف أخرى"),
  },
];

export const chartFor = (edition: string): Entry[] => (edition === "iran" ? IRAN_CHART : DEFAULT_CHART);

export type SystemKey = NonNullable<(typeof DEFAULT_CHART)[number]["key"]> | "cheques_receivable";

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
  const missing = chartFor(EDITION).filter(
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
    case "cheque":
      return "cheques_receivable";
    case "online":
    case "stripe":
    case "zarinpal":
    case "mock_online":
      return "online_clearing";
    default:
      return "bank";
  }
}
