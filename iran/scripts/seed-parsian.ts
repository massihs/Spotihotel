/**
 * Test hotel "Parsian" (slug parsian-test): a 300-room Tehran hotel with a month of activity,
 * every module switched on. Each day is played through the real services — bookings made ahead,
 * deposits, cancellations, arrivals, minibar, spa, room service, the restaurant's till, company
 * accounts, cheques, purchases, supplier payments, expenses — then closed by the night audit, so
 * folios, reports and the general ledger all agree.
 *
 * Run: SEED_PARSIAN=true node dist/seed-parsian.mjs   (PARSIAN_DAYS=30 by default)
 * Owner: SEED_PARSIAN_OWNER, else SEED_SUPERADMIN_EMAIL, else the local demo owner.
 * Idempotent: a finished hotel is brought up to today (the days since the last run are played
 * through and closed by the night audit; the container runs this every hour), a half-built one
 * (interrupted run) is rebuilt.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import {
  categories,
  diningTables,
  hotelAccounts,
  hotelGuests,
  minibarItems,
  nightAudits,
  organizations,
  outlets,
  plans,
  pmsSettings,
  products,
  ratePlans,
  restaurantMembers,
  restaurantSettings,
  restaurants,
  roomTypes,
  stays,
  stockItems,
  subscriptions,
  suppliers as supplierRows,
  taxRates,
  users,
} from "@/server/db/schema";
import { hashPassword } from "@/server/auth/password";
import { createOrganization, createRestaurant } from "@/server/modules/restaurants/service";
import { loadRestaurantContext, type RestaurantContext } from "@/server/tenancy";
import { bulkCreateTables, listTables } from "@/server/modules/tables/service";
import {
  assignRoomType,
  createRatePlan,
  createRoomType,
  getPmsSettings,
  setRateRange,
  updatePmsSettings,
} from "@/server/modules/pms/setup";
import { saveAccount } from "@/server/modules/pms/guests";
import {
  availabilityGrid,
  cancelStay,
  checkIn,
  checkOut,
  confirmStay,
  createStay,
  getStay,
} from "@/server/modules/pms/stays";
import { accountFolioOf, folioView, postCharge, postPayment } from "@/server/modules/pms/folios";
import { bookServiceAsStaff, listServices, saveService } from "@/server/modules/pms/wellness";
import { chargeMinibar, saveMinibarItem } from "@/server/modules/pms/minibar";
import { chargeRoomOrders } from "@/server/modules/pms/room-charges";
import { addDays, nightsBetween, serviceSlots } from "@/server/modules/pms/calc";
import { cancellationFee, savePricingRule } from "@/server/modules/pms/revenue";
import { createBlock } from "@/server/modules/pms/blocks";
import { autoAssignRooms } from "@/server/modules/pms/booking";
import { runNightAudit } from "@/server/modules/pms/night-audit";
import { createPosOrder } from "@/server/modules/pos/service";
import { createExpense } from "@/server/modules/reports/service";
import { createPurchase, createStockItem, createSupplier } from "@/server/modules/inventory/service";
import { paySupplier, setChequeStatus } from "@/server/modules/ledger/finance";
import { openRequest } from "@/server/modules/hotel/requests";
import { createOutlet, setOutletMenu } from "@/server/modules/outlets/service";
import { syncLedger } from "@/server/modules/ledger/sync";
import { localDay } from "@/lib/period";
import { cheques } from "@/server/db/schema";

const SLUG = "parsian-test";
const TZ = "Asia/Tehran";
/** Amounts are stored in rial cents: 1 toman = 1,000. */
const T = (toman: number) => toman * 1000;

// ─── Deterministic randomness ────────────────────────────────────────────────
let seed = 1405;
const rnd = () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const chance = (p: number) => rnd() < p;
const pick = <T>(list: readonly T[]) => list[Math.floor(rnd() * list.length)]!;
const between = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
/** Weighted pick: [[value, weight], …]. */
const weighted = <T>(list: readonly (readonly [T, number])[]) => {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of list) if ((r -= w) < 0) return v;
  return list[0]![0];
};
const dow = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
/** A wall-clock moment of a business day in Tehran. */
const at = (day: string, hh: number, mm = 0) =>
  new Date(`${day}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+03:30`);
const key = () => randomBytes(12).toString("hex");

// ─── People ──────────────────────────────────────────────────────────────────
const MEN = [
  "علی",
  "محمد",
  "حسین",
  "رضا",
  "مهدی",
  "امیر",
  "حامد",
  "سعید",
  "مجید",
  "کامران",
  "بهرام",
  "داریوش",
  "فرهاد",
  "پویا",
  "آرش",
  "نیما",
  "سینا",
  "مسعود",
  "جواد",
  "کیوان",
];
const WOMEN = [
  "فاطمه",
  "زهرا",
  "مریم",
  "سارا",
  "نرگس",
  "لیلا",
  "مینا",
  "شیرین",
  "پریسا",
  "نازنین",
  "الهام",
  "آزاده",
  "مهسا",
  "سمیرا",
  "نگار",
  "رویا",
  "ترانه",
  "هستی",
  "یاسمن",
  "گلاره",
];
const LAST = [
  "محمدی",
  "حسینی",
  "احمدی",
  "رضایی",
  "کریمی",
  "موسوی",
  "جعفری",
  "صادقی",
  "هاشمی",
  "رحیمی",
  "قاسمی",
  "اکبری",
  "نوری",
  "طاهری",
  "شریفی",
  "عباسی",
  "کاظمی",
  "زارعی",
  "یزدانی",
  "فراهانی",
  "تهرانی",
  "شیرازی",
  "اصفهانی",
  "مشهدی",
  "تبریزی",
  "کرمانی",
  "بهرامی",
  "نادری",
  "سلطانی",
  "امینی",
];
const FOREIGN = [
  { first: "Ahmed", last: "Al-Saadi", nat: "IQ" },
  { first: "Mehmet", last: "Yilmaz", nat: "TR" },
  { first: "Hans", last: "Müller", nat: "DE" },
  { first: "Wei", last: "Zhang", nat: "CN" },
  { first: "Khalid", last: "Al-Mansoori", nat: "AE" },
  { first: "Giulia", last: "Bianchi", nat: "IT" },
  { first: "Ivan", last: "Petrov", nat: "RU" },
  { first: "Aliyev", last: "Rashad", nat: "AZ" },
] as const;
const nationalCode = (nine: string) => {
  const sum = nine.split("").reduce((s, d, i) => s + Number(d) * (10 - i), 0);
  const r = sum % 11;
  return nine + String(r < 2 ? r : 11 - r);
};
const digits = (n: number) => Array.from({ length: n }, () => between(0, 9)).join("");
const mobile = () => `09${pick(["12", "35", "19", "13", "33", "01", "21"])}${digits(7)}`;
let sayad = 0;
/** A unique 16-digit Sayad cheque id. */
const sayadId = () => `${String(1405).padStart(4, "0")}${String(++sayad).padStart(6, "0")}${digits(6)}`;
const BANKS = ["ملت", "ملی", "صادرات", "تجارت", "پاسارگاد", "سامان", "پارسیان", "سپه"];

function newGuest() {
  if (chance(0.08)) {
    const f = pick(FOREIGN);
    return {
      firstName: f.first,
      lastName: f.last,
      nationality: f.nat,
      documentType: "passport" as const,
      documentNumber: `${pick(["A", "P", "N", "Y"])}${digits(8)}`,
      phone: `+${between(7, 98)}${digits(9)}`,
    };
  }
  const woman = chance(0.42);
  return {
    firstName: pick(woman ? WOMEN : MEN),
    lastName: pick(LAST),
    fatherName: pick(MEN),
    nationality: "IR",
    documentType: "id_card" as const,
    documentNumber: nationalCode(`0${digits(8)}`),
    phone: mobile(),
    vip: chance(0.03),
  };
}

// ─── The hotel ───────────────────────────────────────────────────────────────
const TYPES = [
  { code: "STD", name: "دو تخته استاندارد", rate: 4_800_000, base: 2, max: 3, extra: 1_400_000 },
  { code: "TWN", name: "دو تخته توئین", rate: 4_600_000, base: 2, max: 2, extra: 0 },
  { code: "DLX", name: "دبل دلوکس رو به شهر", rate: 6_900_000, base: 2, max: 3, extra: 1_600_000 },
  { code: "STE", name: "سوئیت جونیور", rate: 11_500_000, base: 2, max: 4, extra: 1_900_000 },
  { code: "PRS", name: "سوئیت رویال", rate: 24_000_000, base: 2, max: 4, extra: 2_500_000 },
] as const;
type TypeCode = (typeof TYPES)[number]["code"];

/** 15 floors × 20 rooms; the type of each room by floor and position. */
function typeOfRoom(floor: number, n: number): TypeCode {
  if (floor <= 7) return n <= 12 ? "STD" : "TWN";
  if (floor <= 12) return n <= 10 ? "DLX" : "STD";
  if (floor <= 14) return n <= 12 ? "STE" : "DLX";
  return n <= 10 ? "PRS" : "STE";
}

const MENU: [category: string, items: [name: string, toman: number][]][] = [
  [
    "پیش‌غذا",
    [
      ["سوپ جو", 420_000],
      ["کشک بادمجان", 480_000],
      ["میرزا قاسمی", 460_000],
      ["سالاد سزار", 690_000],
      ["ماست و موسیر", 180_000],
    ],
  ],
  [
    "غذای اصلی",
    [
      ["چلوکباب سلطانی", 1_950_000],
      ["چلو جوجه کباب", 1_250_000],
      ["کباب کوبیده", 980_000],
      ["زرشک‌پلو با مرغ", 1_150_000],
      ["قورمه‌سبزی", 890_000],
      ["فسنجان", 1_050_000],
      ["باقالی‌پلو با ماهیچه", 2_200_000],
      ["ماهی قزل‌آلا", 1_450_000],
      ["استیک فیله", 2_600_000],
    ],
  ],
  [
    "دسر",
    [
      ["بستنی سنتی", 320_000],
      ["فالوده شیرازی", 280_000],
      ["کیک شکلاتی", 390_000],
    ],
  ],
  [
    "نوشیدنی",
    [
      ["چای و نبات", 150_000],
      ["قهوه اسپرسو", 190_000],
      ["کاپوچینو", 260_000],
      ["دوغ محلی", 120_000],
      ["آبمیوه طبیعی", 290_000],
      ["آب معدنی", 60_000],
    ],
  ],
];

/** The menu's sections, each with its icon (the guest menu shows it on dishes without a photo). */
const MENU_ICONS: Record<string, string> = {
  پیش‌غذا: "salad",
  "غذای اصلی": "flame",
  دسر: "dessert",
  نوشیدنی: "coffee",
};

const MINIBAR = [
  ["آب معدنی", 120_000],
  ["نوشابه", 180_000],
  ["آبمیوه", 220_000],
  ["آجیل مخلوط", 450_000],
  ["شکلات", 280_000],
  ["چیپس", 200_000],
  ["ماءالشعیر", 240_000],
  ["بیسکویت", 150_000],
] as const;

const STOCK = [
  ["برنج ایرانی", "kg", 280_000],
  ["گوشت گوسفندی", "kg", 1_250_000],
  ["مرغ", "kg", 260_000],
  ["زعفران", "g", 95_000],
  ["روغن", "l", 140_000],
  ["سبزیجات", "kg", 70_000],
  ["نوشیدنی", "piece", 45_000],
  ["لوازم پذیرایی اتاق (آمنیتی)", "pack", 120_000],
  ["ملحفه و حوله", "piece", 650_000],
] as const;

type Planned = {
  type: TypeCode;
  arrival: string;
  departure: string;
  bookingDay: string;
  adults: number;
  children: number;
  source: string;
  plan: "BB" | "RO" | "HB" | "NRF" | "CORP";
  guarantee: "none" | "card" | "deposit" | "company";
  account: number | null;
  status: "confirmed" | "tentative";
  cancelOn: string | null;
  noShow: boolean;
  repeat: boolean;
  eta: string | null;
  id?: string;
};

/**
 * Parsian's points of sale: the traditional restaurant (tables R…), the lobby café (L…), a
 * rooftop restaurant and a pool café, each with its tables and its menu. Also run on a hotel
 * built before outlets existed: its tables are attached and its past orders follow them.
 * Returns how many outlets were added (0 when they already exist).
 */
async function ensureParsianOutlets(ctx: RestaurantContext) {
  const rid = ctx.restaurant.id;
  const [{ n } = { n: 0 }] = await db
    .select({ n: count() })
    .from(outlets)
    .where(eq(outlets.restaurantId, rid));
  if (n > 0) return 0;
  const attach = async (
    name: string,
    kind: "restaurant" | "cafe",
    label: RegExp,
    location: string,
    hours: string,
  ) => {
    const o = await createOutlet(db, ctx, { name, kind, location, hours, tables: 0 });
    const ids = (await listTables(db, ctx))
      .filter((t) => t.kind !== "room" && label.test(t.label))
      .map((t) => t.id);
    if (ids.length)
      await db.update(diningTables).set({ outletId: o.id, zone: name }).where(inArray(diningTables.id, ids));
    return o;
  };
  const shahrzad = await attach("رستوران سنتی شهرزاد", "restaurant", /^R\d+$/, "طبقه همکف", "12:00 – 23:30");
  const lobby = await attach("کافه لابی", "cafe", /^L\d+$/, "لابی", "07:00 – 24:00");
  const rooftop = await createOutlet(db, ctx, {
    name: "رستوران گردان آسمان",
    kind: "restaurant",
    location: "طبقه ۱۵",
    hours: "19:00 – 01:00",
    tables: 16,
    seats: 4,
  });
  const pool = await createOutlet(db, ctx, {
    name: "کافه کنار استخر",
    kind: "pool_bar",
    location: "طبقه منفی دو",
    hours: "08:00 – 22:00",
    tables: 8,
    seats: 2,
  });
  // Menu: dishes in the restaurants, desserts in the cafés, drinks everywhere.
  const cats = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.restaurantId, rid));
  const idOf = (name: string) => cats.filter((c) => c.name === name).map((c) => c.id);
  const kitchen = [...idOf("پیش‌غذا"), ...idOf("غذای اصلی")];
  await setOutletMenu(db, ctx, shahrzad.id, kitchen);
  await setOutletMenu(db, ctx, rooftop.id, [...kitchen, ...idOf("دسر")]);
  await setOutletMenu(db, ctx, lobby.id, idOf("دسر"));
  await setOutletMenu(db, ctx, pool.id, idOf("دسر"));
  // Past orders follow their table's outlet.
  await db.execute(
    sql`update orders o set outlet_id = t.outlet_id from dining_tables t where t.id = o.table_id and o.restaurant_id = ${rid} and o.outlet_id is null and t.outlet_id is not null`,
  );
  return 4;
}

// ─── The simulation, shared by the first build and the catch-up ─────────────

/** What the day-by-day simulation works with: the hotel, its team and its catalogue. */
type World = {
  rid: string;
  hotel: Parameters<typeof syncLedger>[1];
  ownerCtx: RestaurantContext;
  desk: RestaurantContext[];
  accountant: RestaurantContext;
  cashier: RestaurantContext;
  typeId: Map<TypeCode, string>;
  typeCount: Map<TypeCode, number>;
  planId: Record<Planned["plan"], string>;
  services: Awaited<ReturnType<typeof listServices>>;
  minibar: { id: string }[];
  accounts: { id: string; name: string }[];
  dishes: { id: string }[];
  restaurantTables: { id: string }[];
  suppliers: { id: string }[];
  stock: { id: string; name: string }[];
  guestIds: string[];
};

type Sim = {
  plan: Planned[];
  byBookingDay: Map<string, Planned[]>;
  stayIndex: Map<string, Planned>;
  errors: Map<string, number>;
  fail: (what: string, e: unknown) => void;
  /** Day the hotel opened: purchases, payroll and bills follow their cycle from it. */
  day0: string;
  started: number;
};

function newSim(plan: Planned[], day0: string): Sim {
  const byBookingDay = new Map<string, Planned[]>();
  for (const p of plan) byBookingDay.set(p.bookingDay, [...(byBookingDay.get(p.bookingDay) ?? []), p]);
  const errors = new Map<string, number>();
  return {
    plan,
    byBookingDay,
    stayIndex: new Map(),
    errors,
    day0,
    started: Date.now(),
    fail: (what, e) => {
      const code = `${what}:${(e as { message?: string }).message ?? "error"}`;
      errors.set(code, (errors.get(code) ?? 0) + 1);
    },
  };
}

/** Start times a service takes bookings at (afternoon and evening, when guests are in). */
const slotsOf = (svc: World["services"][number]) => {
  const all = serviceSlots(svc.opensAt, svc.closesAt, svc.slotStepMin, svc.durationMin);
  return all.filter((t) => t >= "11:00").length ? all.filter((t) => t >= "11:00") : all;
};
const costOf = (name: string) => STOCK.find(([n]) => n === name)?.[2] ?? 100_000;

/** The world of a hotel built by an earlier run, read back from the database. */
async function loadWorld(
  hotel: typeof restaurants.$inferSelect,
  owner: typeof users.$inferSelect,
): Promise<World> {
  const rid = hotel.id;
  const sessionOf = (u: typeof users.$inferSelect) => ({ ...u, locale: u.locale });
  const ownerCtx = await loadRestaurantContext(db, sessionOf(owner), rid);
  const team: RestaurantContext[] = [];
  for (let i = 1; i <= 5; i++) {
    const [u] = await db
      .select()
      .from(users)
      .where(eq(users.email, `parsian.staff${i}@parsian-test.local`));
    team.push(u ? await loadRestaurantContext(db, sessionOf(u), rid).catch(() => ownerCtx) : ownerCtx);
  }
  const types = await db
    .select({ id: roomTypes.id, code: roomTypes.code })
    .from(roomTypes)
    .where(and(eq(roomTypes.restaurantId, rid), isNull(roomTypes.deletedAt)));
  const perType = await db
    .select({ typeId: diningTables.roomTypeId, n: count() })
    .from(diningTables)
    .where(
      and(eq(diningTables.restaurantId, rid), eq(diningTables.kind, "room"), isNull(diningTables.deletedAt)),
    )
    .groupBy(diningTables.roomTypeId);
  const plansRows = await db
    .select({ id: ratePlans.id, code: ratePlans.code })
    .from(ratePlans)
    .where(eq(ratePlans.restaurantId, rid));
  return {
    rid,
    hotel,
    ownerCtx,
    desk: team.slice(0, 3),
    accountant: team[3]!,
    cashier: team[4]!,
    typeId: new Map(types.map((t) => [t.code as TypeCode, t.id])),
    typeCount: new Map(
      types.map((t) => [t.code as TypeCode, perType.find((c) => c.typeId === t.id)?.n ?? 0]),
    ),
    planId: Object.fromEntries(plansRows.map((p) => [p.code, p.id])) as World["planId"],
    services: await listServices(db, rid),
    minibar: await db
      .select({ id: minibarItems.id })
      .from(minibarItems)
      .where(and(eq(minibarItems.restaurantId, rid), eq(minibarItems.active, true))),
    accounts: await db
      .select({ id: hotelAccounts.id, name: hotelAccounts.name })
      .from(hotelAccounts)
      .where(eq(hotelAccounts.restaurantId, rid))
      .orderBy(asc(hotelAccounts.createdAt)),
    dishes: await db.select({ id: products.id }).from(products).where(eq(products.restaurantId, rid)),
    restaurantTables: (await listTables(db, ownerCtx)).filter((p) => p.kind !== "room"),
    suppliers: await db
      .select({ id: supplierRows.id })
      .from(supplierRows)
      .where(eq(supplierRows.restaurantId, rid))
      .orderBy(asc(supplierRows.createdAt)),
    stock: await db
      .select({ id: stockItems.id, name: stockItems.name })
      .from(stockItems)
      .where(eq(stockItems.restaurantId, rid)),
    guestIds: (
      await db
        .select({ id: hotelGuests.id })
        .from(hotelGuests)
        .where(eq(hotelGuests.restaurantId, rid))
        .limit(3000)
    ).map((g) => g.id),
  };
}

/**
 * Who books what, when: for each arrival day and room type, enough bookings to reach the day's
 * occupancy (busier mid-week, quieter on Friday), fewer the further ahead it is (not booked yet).
 * `sold` holds the rooms already taken per type and night (updated as bookings are planned),
 * `earliest` is the first day a booking can be made.
 */
function planDemand(
  w: World,
  o: { from: string; earliest: string; today: string; horizon: string; sold: Map<string, number> },
) {
  const { sold, today } = o;
  const soldKey = (t: TypeCode, d: string) => `${t}|${d}`;
  const room = (t: TypeCode, d: string) => sold.get(soldKey(t, d)) ?? 0;
  const take = (t: TypeCode, a: string, d: string) => {
    for (let x = a; x < d; x = addDays(x, 1)) sold.set(soldKey(t, x), room(t, x) + 1);
  };
  const plan: Planned[] = [];
  for (let a = o.from; a <= o.horizon; a = addDays(a, 1)) {
    const wd = dow(a);
    const base = wd === 3 || wd === 4 ? 0.9 : wd === 5 ? 0.6 : wd === 6 ? 0.7 : 0.76;
    const ahead = nightsBetween(today, a);
    const onBooks = ahead > 0 ? Math.max(0.12, 1 - ahead / 17) : 1;
    for (const t of TYPES) {
      const cap = w.typeCount.get(t.code) ?? 0;
      if (!cap) continue;
      const typeAdj = t.code === "PRS" ? -0.35 : t.code === "STE" ? -0.12 : 0;
      const target = Math.round(
        cap * Math.min(0.97, Math.max(0.1, base + typeAdj + (rnd() - 0.5) * 0.12)) * onBooks,
      );
      let guard = 0;
      while (room(t.code, a) < target && guard++ < cap) {
        let los = weighted([
          [1, 30],
          [2, 30],
          [3, 20],
          [4, 10],
          [5, 5],
          [7, 5],
        ] as const);
        while (los > 1) {
          let ok = true;
          for (let i = 0; i < los; i++) if (room(t.code, addDays(a, i)) >= cap) ok = false;
          if (ok) break;
          los--;
        }
        if (room(t.code, a) >= cap) break;
        const departure = addDays(a, los);
        take(t.code, a, departure);
        const source = weighted([
          ["direct", 24],
          ["phone", 12],
          ["website", 9],
          ["walk_in", 5],
          ["snapptrip", 18],
          ["alibaba", 13],
          ["jabama", 8],
          ["eghamat24", 7],
          ["flytoday", 4],
        ] as const);
        const corporate = chance(0.16);
        const account = corporate ? between(0, 2) : chance(0.03) ? 3 : null;
        const planCode = corporate
          ? "CORP"
          : weighted([
              ["BB", 60],
              ["RO", 12],
              ["HB", los >= 2 ? 10 : 0],
              ["NRF", 18],
            ] as const);
        const lead = weighted([
          [0, 8],
          [1, 10],
          [3, 15],
          [7, 25],
          [14, 25],
          [25, 17],
        ] as const);
        const bookingDay = a < addDays(o.earliest, lead) ? o.earliest : addDays(a, -lead);
        const guarantee =
          account !== null
            ? "company"
            : planCode === "NRF"
              ? "deposit"
              : weighted([
                  ["none", 45],
                  ["card", 25],
                  ["deposit", 30],
                ] as const);
        const adults = Math.min(
          t.max,
          weighted([
            [1, 25],
            [2, 65],
            [3, 10],
          ] as const),
        );
        const cancel = chance(0.06) && nightsBetween(bookingDay, a) >= 2;
        plan.push({
          type: t.code,
          arrival: a,
          departure,
          bookingDay: a <= today && bookingDay > a ? a : bookingDay,
          adults,
          children: adults >= 2 && chance(0.12) ? 1 : 0,
          source: account === 3 ? "agency" : account !== null ? "direct" : source,
          plan: planCode as Planned["plan"],
          guarantee,
          account,
          status: ahead > 2 && chance(0.06) ? "tentative" : "confirmed",
          cancelOn: cancel
            ? addDays(bookingDay, between(1, Math.max(1, nightsBetween(bookingDay, a) - 1)))
            : null,
          noShow: !cancel && guarantee !== "company" && chance(0.025),
          repeat: chance(0.1),
          eta: chance(0.4) ? `${between(13, 22)}:${pick(["00", "30"])}` : null,
        });
        if (cancel)
          for (let x = a; x < departure; x = addDays(x, 1)) sold.set(soldKey(t.code, x), room(t.code, x) - 1);
      }
    }
  }
  return plan;
}

async function createPlanned(w: World, sim: Sim, p: Planned) {
  try {
    const reuse = p.repeat && w.guestIds.length > 20 ? pick(w.guestIds) : null;
    const s = await createStay(db, pick(w.desk), {
      ...(reuse ? { guestId: reuse } : { guest: newGuest() }),
      roomTypeId: w.typeId.get(p.type)!,
      ratePlanId: w.planId[p.plan],
      accountId: p.account !== null ? w.accounts[p.account]!.id : null,
      arrival: p.arrival,
      departure: p.departure,
      adults: p.adults,
      children: p.children,
      source: p.source as "direct",
      channelRef: ["snapptrip", "alibaba", "jabama", "eghamat24", "flytoday"].includes(p.source)
        ? `${p.source.slice(0, 3).toUpperCase()}-${digits(7)}`
        : null,
      guarantee: p.guarantee,
      status: p.status,
      eta: p.eta,
    });
    p.id = s.id;
    sim.stayIndex.set(s.id, p);
    if (!reuse) w.guestIds.push(s.guestId);
    // Deposits: online or by transfer, a night or two ahead.
    if (p.guarantee === "deposit") {
      const view = await getStay(db, w.ownerCtx, s.id);
      const total = view.nights.reduce((sum, n) => sum + n.rateCents, 0);
      const amount = p.plan === "NRF" ? total : Math.round((total * 0.3) / 1_000_000) * 1_000_000;
      if (amount > 0)
        await postPayment(db, pick(w.desk), view.folios[0]!.id, {
          amountCents: amount,
          method: chance(0.6) ? "online" : "transfer",
          reference: p.plan === "NRF" ? "پیش‌پرداخت کامل" : "بیعانه",
        });
    }
  } catch (e) {
    sim.fail("book", e);
  }
}

/** Rows written since `since` (real time) are moved to the simulated business day. */

async function backdate(rid: string, since: Date, day: string) {
  const ts = (from: number, spanH: number) =>
    sql.raw(
      `least((('${day}'::date + time '${String(from).padStart(2, "0")}:00') + random() * interval '${spanH} hours') at time zone '${TZ}', now())`,
    );
  const iso = since.toISOString();
  await db.execute(
    sql`update stays set created_at = ${ts(8, 14)} where restaurant_id = ${rid} and created_at >= ${iso}`,
  );
  await db.execute(
    sql`update stays set checked_in_at = ${ts(14, 8)} where restaurant_id = ${rid} and checked_in_at >= ${iso}`,
  );
  await db.execute(
    sql`update stays set checked_out_at = ${ts(7, 5)} where restaurant_id = ${rid} and checked_out_at >= ${iso}`,
  );
  await db.execute(
    sql`update stays set cancelled_at = ${ts(9, 10)} where restaurant_id = ${rid} and cancelled_at >= ${iso}`,
  );
  await db.execute(
    sql`update stays set updated_at = greatest(created_at, coalesce(checked_out_at, checked_in_at, cancelled_at, created_at)) where restaurant_id = ${rid} and updated_at >= ${iso}`,
  );
  await db.execute(
    sql`update hotel_guests set created_at = ${ts(8, 14)}, updated_at = ${ts(8, 14)} where restaurant_id = ${rid} and created_at >= ${iso}`,
  );
  await db.execute(
    sql`update folio_lines set created_at = ${ts(7, 16)} where restaurant_id = ${rid} and created_at >= ${iso}`,
  );
  await db.execute(
    sql`update orders set placed_at = ${ts(12, 11)}, status = 'served' where restaurant_id = ${rid} and placed_at >= ${iso}`,
  );
  await db.execute(
    sql`update orders set created_at = placed_at, updated_at = placed_at + interval '40 minutes', accepted_at = placed_at + interval '2 minutes', ready_at = placed_at + interval '22 minutes' where restaurant_id = ${rid} and created_at >= ${iso}`,
  );
  await db.execute(
    sql`update payments set succeeded_at = ${ts(12, 11)} where restaurant_id = ${rid} and succeeded_at >= ${iso}`,
  );
  await db.execute(
    sql`update payments set created_at = coalesce(succeeded_at, created_at), updated_at = coalesce(succeeded_at, updated_at) where restaurant_id = ${rid} and created_at >= ${iso}`,
  );
  await db.execute(
    sql`update table_sessions s set status = 'closed', closed_at = ${ts(15, 8)} from dining_tables t where t.id = s.table_id and t.kind <> 'room' and s.restaurant_id = ${rid} and s.status = 'open'`,
  );
  await db.execute(
    sql`update table_sessions set opened_at = ${ts(12, 4)} where restaurant_id = ${rid} and opened_at >= ${iso}`,
  );
  await db.execute(
    sql`update purchases set purchased_at = ${ts(9, 6)} where restaurant_id = ${rid} and purchased_at >= ${iso}`,
  );
  await db.execute(
    sql`update service_bookings set created_at = ${ts(8, 12)} where restaurant_id = ${rid} and created_at >= ${iso}`,
  );
  await db.execute(
    sql`update cheques set created_at = ${ts(9, 9)} where restaurant_id = ${rid} and created_at >= ${iso}`,
  );
  await db.execute(
    sql`update audit_logs set created_at = ${ts(7, 16)} where restaurant_id = ${rid} and created_at >= ${iso}`,
  );
}

/**
 * One business day of the hotel, through the real services: the bookings made that day, the
 * day's cancellations, departures (settled, or signed to the company account), housekeeping,
 * arrivals, life in the rooms (minibar, spa, room service, laundry), the restaurants' tills,
 * spending, company payments and cheques; then the night audit closes it, except today, which is
 * left at mid-afternoon (half the departures and arrivals still to do). `resume` finishes a day
 * a previous run left at mid-afternoon.
 */
async function simulateDay(
  w: World,
  sim: Sim,
  d: string,
  o: { isToday: boolean; resume?: boolean; events?: () => Promise<void> },
) {
  const {
    rid,
    ownerCtx,
    accountant,
    cashier,
    minibar,
    services,
    dishes,
    restaurantTables,
    suppliers,
    stock,
    accounts,
  } = w;
  const { plan, stayIndex, fail, day0, started } = sim;
  const receptionist = () => pick(w.desk);
  const { isToday } = o;
  const resume = !!o.resume;
  const t0 = new Date();

  // Bookings made today.
  for (const p of sim.byBookingDay.get(d) ?? []) await createPlanned(w, sim, p);
  await o.events?.();

  // Cancellations of the day.
  for (const p of plan.filter((x) => x.cancelOn === d && x.id)) {
    try {
      const fee = await cancellationFee(db, ownerCtx, p.id!, at(d, 11));
      await cancelStay(db, receptionist(), p.id!, {
        reason: pick(["تغییر برنامه سفر", "لغو توسط آژانس", "بیماری", "لغو جلسه کاری"]),
        feeCents: fee.feeCents,
      });
    } catch (e) {
      fail("cancel", e);
    }
  }

  // Departures: settle and check out (today: only the morning's half).
  const leaving = await db
    .select({ id: stays.id, accountId: stays.accountId })
    .from(stays)
    .where(and(eq(stays.restaurantId, rid), eq(stays.status, "in_house"), sql`${stays.departure} <= ${d}`));
  for (const s of leaving) {
    if (isToday && chance(0.45)) continue;
    try {
      // Room service still open goes on the bill first, as the desk does at check-out.
      await chargeRoomOrders(db, ownerCtx, s.id);
      if (s.accountId) {
        // Company guests sign: the balance moves to the company's account (city ledger).
        await checkOut(db, accountant, s.id, { toAccount: true });
        continue;
      }
      const ctx = receptionist();
      const method = weighted([
        ["card", 58],
        ["cash", 12],
        ["transfer", 14],
        ["online", 10],
        ["cheque", 6],
      ] as const);
      for (let attempt = 0; ; attempt++) {
        const view = await getStay(db, ctx, s.id);
        for (const f of view.folios) {
          if (f.balanceCents > 0)
            await postPayment(db, ctx, f.id, {
              amountCents: f.balanceCents,
              method,
              reference: method === "card" ? `POS-${digits(6)}` : null,
              cheque:
                method === "cheque"
                  ? {
                      sayadId: sayadId(),
                      number: digits(6),
                      bank: pick(BANKS),
                      party: `${view.firstName} ${view.lastName}`,
                      dueDate: addDays(d, pick([7, 15, 30])),
                    }
                  : undefined,
            });
          else if (f.balanceCents < 0)
            // Deposit above the bill: the difference is handed back.
            await postCharge(db, ownerCtx, f.id, {
              department: "misc",
              description: "استرداد مازاد بیعانه",
              unitCents: -f.balanceCents,
              taxRateBps: 0,
            });
        }
        try {
          await checkOut(db, ctx, s.id);
          break;
        } catch (e) {
          // Nights or orders added by the check-out itself: settle them and try again.
          if (attempt >= 2 || (e as { message?: string }).message !== "folio_not_settled") throw e;
        }
      }
    } catch (e) {
      fail("departure", e);
    }
  }

  // Housekeeping cleans the rooms freed this morning.
  await db
    .update(diningTables)
    .set({ housekeeping: "clean" })
    .where(
      and(
        eq(diningTables.restaurantId, rid),
        eq(diningTables.kind, "room"),
        inArray(diningTables.housekeeping, ["dirty", "cleaning", "inspected"]),
        isToday ? sql`random() < 0.5` : sql`true`,
      ),
    );

  // Arrivals (today: those already in by mid-afternoon).
  const arriving = await db
    .select({ id: stays.id, status: stays.status })
    .from(stays)
    .where(
      and(
        eq(stays.restaurantId, rid),
        inArray(stays.status, ["tentative", "confirmed"]),
        eq(stays.arrival, d),
      ),
    );
  for (const s of arriving) {
    const p = stayIndex.get(s.id);
    if (p?.noShow) continue;
    if (isToday && chance(0.5)) continue;
    try {
      const ctx = receptionist();
      if (s.status === "tentative") await confirmStay(db, ctx, s.id);
      await checkIn(db, ctx, s.id, { allowDirty: true });
    } catch (e) {
      fail("checkin", e);
    }
  }

  // Life in the hotel: minibar, spa, room service, laundry, dinner on the room.
  const inHouse = await db
    .select({ id: stays.id, roomId: stays.roomId })
    .from(stays)
    .where(and(eq(stays.restaurantId, rid), eq(stays.status, "in_house")));
  const activity = isToday ? 0.4 : resume ? 0.6 : 1;
  for (const s of inHouse) {
    try {
      if (chance(0.13 * activity))
        await chargeMinibar(db, receptionist(), s.id, [
          { itemId: pick(minibar).id, quantity: between(1, 3) },
          ...(chance(0.4) ? [{ itemId: pick(minibar).id, quantity: 1 }] : []),
        ]);
      if (chance(0.07 * activity)) {
        const paid = services.filter((x) => x.priceCents > 0);
        const svc = chance(0.6) ? pick(paid) : pick(services);
        await bookServiceAsStaff(
          db,
          receptionist(),
          { serviceId: svc.id, day: d, time: pick(slotsOf(svc)), people: 1, stayId: s.id },
          at(d, 9),
        ).catch((e) => fail("spa", e));
      }
      if (chance(0.15 * activity) && s.roomId) {
        const lines = Array.from({ length: between(1, 3) }, () => ({
          productId: pick(dishes).id,
          quantity: between(1, 2),
        }));
        await createPosOrder(db, cashier, {
          channel: "dine_in",
          tableId: s.roomId,
          lines,
          idempotencyKey: key(),
        });
        await chargeRoomOrders(db, ownerCtx, s.id);
      }
      if (chance(0.04 * activity))
        await postCharge(db, receptionist(), (await getStay(db, ownerCtx, s.id)).folios[0]!.id, {
          department: "laundry",
          description: pick(["شستشو و اتو پیراهن", "خشک‌شویی کت و شلوار", "شستشوی لباس"]),
          quantity: between(1, 4),
          unitCents: T(pick([180_000, 350_000, 450_000])),
        });
      if (chance(0.06 * activity))
        await postCharge(db, receptionist(), (await getStay(db, ownerCtx, s.id)).folios[0]!.id, {
          department: "fnb",
          description: "شام رستوران سنتی",
          quantity: between(1, 3),
          unitCents: T(pick([1_450_000, 1_950_000, 2_400_000])),
        });
      if (chance(0.02 * activity))
        await postCharge(db, receptionist(), (await getStay(db, ownerCtx, s.id)).folios[0]!.id, {
          department: "transport",
          description: pick(["ترانسفر فرودگاه امام", "تاکسی رزرو شده"]),
          unitCents: T(pick([1_800_000, 2_500_000])),
        });
    } catch (e) {
      fail("extras", e);
    }
  }

  // The restaurant and lobby café: walk-in guests paying at the till.
  const walkIns = Math.round(between(22, 40) * activity);
  for (let i = 0; i < walkIns; i++) {
    try {
      const lines = Array.from({ length: between(1, 4) }, () => ({
        productId: pick(dishes).id,
        quantity: between(1, 3),
      }));
      const dineIn = chance(0.85);
      await createPosOrder(db, cashier, {
        channel: dineIn ? "dine_in" : "takeaway",
        tableId: dineIn ? pick(restaurantTables).id : null,
        lines,
        customerPhone: chance(0.3) ? mobile() : "",
        payment: { provider: chance(0.7) ? "on_site_terminal" : "cash" },
        idempotencyKey: key(),
      });
    } catch (e) {
      fail("till", e);
    }
  }

  // Money out: purchases, suppliers, expenses, payroll, utilities.
  const n = nightsBetween(day0, d);
  // (A day picked up again already had its spending.)
  if (!resume)
    try {
      if (n % 3 === 0)
        await createPurchase(db, ownerCtx, {
          supplierId: pick(suppliers).id,
          reference: `F-${digits(5)}`,
          lines: stock
            .filter(() => chance(0.5))
            .slice(0, 5)
            .map((s, i) => ({
              stockItemId: s.id,
              quantity: between(5, 40),
              unitCostCents: T(costOf(s.name)) + i,
            })),
        }).catch((e) => fail("purchase", e));
      if (n % 7 === 5)
        for (const s of suppliers.slice(0, 2 + (n % 2))) {
          const cheque = chance(0.5);
          await paySupplier(db, accountant, {
            supplierId: s.id,
            amountCents: T(between(30, 120) * 1_000_000),
            method: cheque ? "cheque" : "transfer",
            paidOn: d,
            reference: cheque ? null : `TRF-${digits(8)}`,
            cheque: cheque
              ? {
                  sayadId: sayadId(),
                  number: digits(6),
                  bank: "پارسیان",
                  dueDate: addDays(d, pick([10, 20, 30])),
                }
              : undefined,
          }).catch((e) => fail("supplier", e));
        }
      await createExpense(db, accountant, {
        category: pick(["supplies", "maintenance", "other"] as const),
        amountCents: T(between(3, 25) * 1_000_000),
        description: pick([
          "تعمیرات تأسیسات",
          "لوازم نظافت",
          "گل‌آرایی لابی",
          "خرید لوازم اداری",
          "سرویس آسانسور",
        ]),
        method: chance(0.5) ? "cash" : "transfer",
        paidAt: at(d, 13),
      });
      if (n % 30 === 1)
        await createExpense(db, accountant, {
          category: "salaries",
          amountCents: T(6_800_000_000),
          description: "حقوق و دستمزد کارکنان — ماه گذشته",
          method: "transfer",
          paidAt: at(d, 10),
        });
      if (n % 30 === 8)
        for (const [description, toman] of [
          ["قبض برق", 420_000_000],
          ["قبض گاز", 260_000_000],
          ["قبض آب", 95_000_000],
          ["اینترنت و تلفن", 48_000_000],
        ] as const)
          await createExpense(db, accountant, {
            category: "utilities",
            amountCents: T(toman),
            description,
            method: "transfer",
            paidAt: at(d, 11),
          });
      if (n % 30 === 12)
        await createExpense(db, accountant, {
          category: "marketing",
          amountCents: T(180_000_000),
          description: "تبلیغات در اسنپ‌تریپ و اینستاگرام",
          method: "transfer",
          paidAt: at(d, 12),
        });
      if (n % 30 === 20)
        await createExpense(db, accountant, {
          category: "taxes",
          amountCents: T(350_000_000),
          description: "عوارض شهرداری و مالیات فصل",
          method: "transfer",
          paidAt: at(d, 12),
        });
    } catch (e) {
      fail("finance", e);
    }

  // Companies settle their city-ledger accounts every week (transfer or cheque).
  if (!resume && n % 7 === 6)
    for (const a of accounts) {
      try {
        const folio = await accountFolioOf(db, rid, a.id);
        const v = await folioView(db, rid, folio.id);
        if (v.balanceCents <= 0) continue;
        // One transfer or cheque per installment (a single payment is capped at 1,000 billion rials).
        for (let left = v.balanceCents; left > 0;) {
          const amount = Math.min(left, T(800_000_000));
          left -= amount;
          const byCheque = chance(0.4);
          await postPayment(db, accountant, folio.id, {
            amountCents: amount,
            method: byCheque ? "cheque" : "transfer",
            reference: byCheque ? null : `SATNA-${digits(8)}`,
            cheque: byCheque
              ? {
                  sayadId: sayadId(),
                  number: digits(6),
                  bank: pick(BANKS),
                  party: a.name,
                  dueDate: addDays(d, pick([10, 20, 30])),
                }
              : undefined,
          });
        }
      } catch (e) {
        fail("city_ledger", e);
      }
    }

  // Cheques falling due: received ones are deposited then cleared (some bounce), issued ones clear.
  const due = await db
    .select()
    .from(cheques)
    .where(
      and(
        eq(cheques.restaurantId, rid),
        sql`${cheques.dueDate} <= ${d}`,
        inArray(cheques.status, ["in_hand", "deposited", "issued"]),
      ),
    );
  for (const c of due) {
    try {
      if (c.status === "in_hand") await setChequeStatus(db, accountant, c.id, "deposited", d);
      else if (c.status === "deposited")
        await setChequeStatus(db, accountant, c.id, chance(0.08) ? "bounced" : "cleared", d);
      else if (c.status === "issued") await setChequeStatus(db, accountant, c.id, "cleared", d);
    } catch (e) {
      fail("cheque", e);
    }
  }

  await backdate(rid, t0, d);
  if (!isToday) {
    try {
      await runNightAudit(db, ownerCtx);
    } catch (e) {
      fail("audit", e);
      console.error(`  audit ${d} failed`, e);
    }
    await db.execute(
      sql`update night_audits set created_at = ${at(d, 23, 50).toISOString()} where restaurant_id = ${rid} and business_date = ${d}`,
    );
    await db.execute(
      sql`update audit_logs set created_at = ${at(d, 23, 50).toISOString()} where restaurant_id = ${rid} and created_at >= ${t0.toISOString()}`,
    );
  }
  const [{ n: inh } = { n: 0 }] = await db
    .select({ n: count() })
    .from(stays)
    .where(and(eq(stays.restaurantId, rid), eq(stays.status, "in_house")));
  console.log(`  ${d}: ${inh} rooms in house (${Math.round((Date.now() - started) / 1000)} s)`);
}

/** The desk's morning routine: rooms given to the bookings of the next ten days (the planning fills up). */
async function allocate(w: World, today: string) {
  try {
    const r = await autoAssignRooms(db, w.ownerCtx, { from: today, to: addDays(today, 10) });
    console.log(`  Parsian: rooms given to ${r.assigned} bookings of the next 10 days (${r.left} left)`);
  } catch (e) {
    console.error("  room allocation failed", e);
  }
}

/** Today's loose ends: a few requests from rooms, pre-registrations, two rooms out of order. */
async function looseEnds(w: World, today: string, outOfOrder: boolean) {
  const { rid } = w;
  // Requests from earlier days were dealt with.
  await db.execute(
    sql`update service_requests set status = 'done', done_at = coalesce(done_at, now()) where restaurant_id = ${rid} and status <> 'done'`,
  );
  const occupied = await db
    .select({ roomId: stays.roomId, label: diningTables.label })
    .from(stays)
    .innerJoin(diningTables, eq(diningTables.id, stays.roomId))
    .where(and(eq(stays.restaurantId, rid), eq(stays.status, "in_house")))
    .limit(40);
  for (const o of occupied.filter(() => chance(0.2)).slice(0, 7))
    await openRequest(db, {
      restaurantId: rid,
      tableId: o.roomId!,
      placeLabel: o.label,
      kind: pick(["towels", "housekeeping", "reception", "water"]),
      label: null,
      note: chance(0.3) ? "لطفاً سریع‌تر" : null,
    });
  await db.execute(
    sql`update stays set precheckin_at = now() where restaurant_id = ${rid} and status = 'confirmed' and arrival between ${today} and ${addDays(today, 2)} and random() < 0.3`,
  );
  if (outOfOrder)
    await db.execute(
      sql`update dining_tables set housekeeping = 'out_of_order' where id in (select id from dining_tables t where t.restaurant_id = ${rid} and t.kind = 'room' and t.deleted_at is null and not exists (select 1 from stays s where s.room_id = t.id and s.status = 'in_house') order by t.label desc limit 2)`,
    );
}

/**
 * The test hotel lives in the present: started again days after it was built, it plays the
 * missing days through (the last one finished, the days in between in full, today up to
 * mid-afternoon), each closed by the night audit, with new bookings for the next two weeks.
 * Returns false when the hotel is too far behind to catch up (it is then rebuilt).
 */
async function catchUp(w: World) {
  const today = localDay(new Date(), TZ);
  const { businessDate: from } = await getPmsSettings(db, w.rid, TZ);
  if (from >= today) {
    console.log(`✓ Parsian test hotel up to date (${from})`);
    return true;
  }
  const gap = nightsBetween(from, today);
  if (gap > 30) return false;
  // A new draw each day, and cheque numbers after the ones already issued.
  seed = Number(today.replaceAll("-", "")) | 0;
  const [{ n: issued } = { n: 0 }] = await db
    .select({ n: count() })
    .from(cheques)
    .where(eq(cheques.restaurantId, w.rid));
  sayad = 100_000 + issued;
  console.log(`  Parsian: catching up ${gap} day(s), ${from} → ${today}`);
  const horizon = addDays(today, 14);
  for (const t of TYPES)
    await setRateRange(db, w.ownerCtx, {
      roomTypeId: w.typeId.get(t.code)!,
      from,
      to: addDays(horizon, 7),
      rateCents: T(Math.round((t.rate * 1.15) / 10_000) * 10_000),
      weekdays: [3, 4],
    });
  const grid = await availabilityGrid(db, w.ownerCtx, from, nightsBetween(from, horizon) + 8);
  const sold = new Map<string, number>();
  for (const t of grid.types) for (const x of t.days) sold.set(`${t.code}|${x.day}`, t.rooms - x.free);
  const plan = planDemand(w, { from, earliest: from, today, horizon, sold });
  const [{ first } = { first: null }] = await db
    .select({ first: sql<string | null>`min(${nightAudits.businessDate})::text` })
    .from(nightAudits)
    .where(eq(nightAudits.restaurantId, w.rid));
  const sim = newSim(plan, first ?? from);
  for (let d = from; d <= today; d = addDays(d, 1))
    await simulateDay(w, sim, d, { isToday: d === today, resume: d === from });
  await looseEnds(w, today, false);
  await allocate(w, today);
  await syncLedger(db, w.hotel);
  console.log(
    `✓ Parsian test hotel brought up to ${today}: ${plan.length} new bookings (${Math.round((Date.now() - sim.started) / 1000)} s)`,
  );
  if (sim.errors.size) console.log("  skipped:", Object.fromEntries(sim.errors));
  return true;
}

export async function seedParsian(ownerEmail: string, days = 30) {
  const [owner] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = ${ownerEmail.toLowerCase()}`);
  if (!owner) throw new Error(`owner ${ownerEmail} not found`);

  const [existing] = await db.select().from(restaurants).where(eq(restaurants.slug, SLUG));
  if (existing) {
    const [done] = await db
      .select({ n: count() })
      .from(nightAudits)
      .where(eq(nightAudits.restaurantId, existing.id));
    if ((done?.n ?? 0) >= days) {
      const ctx = await loadRestaurantContext(db, { ...owner, locale: owner.locale }, existing.id);
      const added = await ensureParsianOutlets(ctx);
      for (const [name, icon] of Object.entries(MENU_ICONS))
        await db
          .update(categories)
          .set({ icon })
          .where(
            and(eq(categories.restaurantId, existing.id), eq(categories.name, name), isNull(categories.icon)),
          );
      // The corporate rate is negotiated: never on the hotel's public booking page.
      await db
        .update(ratePlans)
        .set({ bookableOnline: false })
        .where(and(eq(ratePlans.restaurantId, existing.id), eq(ratePlans.code, "CORP")));
      if (added) console.log(`✓ Parsian test hotel: ${added} restaurants and cafés added`);
      if (await catchUp(await loadWorld(existing, owner))) return;
      console.log("! Parsian test hotel too far behind — rebuilding");
    } else console.log("! Parsian test hotel incomplete — rebuilding");
    await db.delete(restaurants).where(eq(restaurants.id, existing.id));
    await db.delete(organizations).where(eq(organizations.id, existing.organizationId));
  }
  const started = Date.now();

  // ── Organization, hotel, plan ─────────────────────────────────────────────
  const hotel = await db.transaction(async (tx) => {
    const org = await createOrganization(tx, {
      name: "گروه هتل‌های پارسیان (آزمایشی)",
      ownerUserId: owner.id,
      billingEmail: owner.email,
    });
    const r = await createRestaurant(tx, {
      organizationId: org.id,
      ownerUserId: owner.id,
      name: "هتل پارسیان (آزمایشی)",
      kind: "hotel",
    });
    await tx
      .update(restaurants)
      .set({
        slug: SLUG,
        phone: "+98 21 8800 0000",
        email: "reservation@parsian-test.local",
        addressLine1: "خیابان ولیعصر، بالاتر از میدان ونک، پلاک ۲۰۰۰",
        city: "تهران",
        postalCode: "1968653111",
      })
      .where(eq(restaurants.id, r.id));
    await tx
      .update(restaurantSettings)
      .set({
        orderPrefix: "P",
        legalName: "شرکت هتلداری پارسیان (آزمایشی)",
        legalId: "10101234567",
        vatNumber: "411111111111",
        onlinePaymentEnabled: true,
        enabledPaymentProviders: ["cash", "on_site_terminal", "pay_later", "zarinpal"],
        disabledModules: [],
      })
      .where(eq(restaurantSettings.restaurantId, r.id));
    const [ent] = await tx.select().from(plans).where(eq(plans.code, "enterprise"));
    if (ent)
      await tx
        .update(subscriptions)
        .set({ planId: ent.id, status: "active" })
        .where(eq(subscriptions.organizationId, org.id));
    return r;
  });
  const rid = hotel.id;
  const sessionOf = (u: typeof users.$inferSelect) => ({ ...u, locale: u.locale });
  const ownerCtx = await loadRestaurantContext(db, sessionOf(owner), rid);

  // ── Team: front desk (three shifts), accountant, restaurant cashier ───────
  const staffPassword = await hashPassword(randomBytes(24).toString("hex"));
  const people = [
    { name: "نسرین افشار", role: "staff" as const, job: null },
    { name: "بهزاد مرادی", role: "staff" as const, job: null },
    { name: "الهام کیانی", role: "staff" as const, job: null },
    { name: "مهرداد سپهری", role: "admin" as const, job: null },
    { name: "رامین توکلی", role: "staff" as const, job: "cashier" },
  ];
  const team: RestaurantContext[] = [];
  for (const [i, p] of people.entries()) {
    const email = `parsian.staff${i + 1}@parsian-test.local`;
    let [u] = await db.select().from(users).where(eq(users.email, email));
    if (!u)
      [u] = await db
        .insert(users)
        .values({ email, passwordHash: staffPassword, fullName: p.name })
        .returning();
    await db.insert(restaurantMembers).values({ restaurantId: rid, userId: u!.id, role: p.role, job: p.job });
    team.push(await loadRestaurantContext(db, sessionOf(u!), rid));
  }
  const desk = team.slice(0, 3);
  const accountant = team[3]!;
  const cashier = team[4]!;
  const receptionist = () => pick(desk);

  // ── Rooms: 15 floors × 20 ─────────────────────────────────────────────────
  for (let floor = 1; floor <= 15; floor++)
    await bulkCreateTables(db, ownerCtx, {
      from: floor * 100 + 1,
      to: floor * 100 + 20,
      kind: "room",
      zone: `طبقه ${floor}`,
      capacity: 2,
    });
  await bulkCreateTables(db, ownerCtx, {
    from: 1,
    to: 24,
    prefix: "R",
    kind: "table",
    zone: "رستوران سنتی",
    capacity: 4,
  });
  await bulkCreateTables(db, ownerCtx, {
    from: 1,
    to: 10,
    prefix: "L",
    kind: "table",
    zone: "کافی‌شاپ لابی",
    capacity: 2,
  });
  const places = await listTables(db, ownerCtx);
  const rooms = places.filter((p) => p.kind === "room");
  let restaurantTables = places.filter((p) => p.kind !== "room");

  await updatePmsSettings(db, ownerCtx, {
    checkInTime: "14:00",
    checkOutTime: "12:00",
    roomTaxBps: 1000,
    serviceTaxBps: 1000,
    cityTaxCents: 0,
    autoChargeRoomService: true,
    minibarSelfService: true,
    chargeNoShows: true,
    channelCommissions: { snapptrip: 1500, alibaba: 1200, jabama: 1000, eghamat24: 1200, flytoday: 1100 },
    wifiName: "Parsian-Guests",
    wifiPassword: "parsian1405",
    guestInfo:
      "صبحانه از ساعت ۶:۳۰ تا ۱۰:۳۰ در رستوران لابی.\nاستخر، سونا و جکوزی در طبقه منفی دو، ساعت ۷ تا ۲۲ (سانس بانوان و آقایان جداگانه).\nرستوران سنتی: ناهار ۱۲ تا ۱۶، شام ۱۹ تا ۲۳.\nپذیرش ۲۴ ساعته: داخلی ۰.",
  });
  const typeId = new Map<TypeCode, string>();
  const typeCount = new Map<TypeCode, number>();
  for (const t of TYPES) {
    const created = await createRoomType(db, ownerCtx, {
      code: t.code,
      name: t.name,
      baseOccupancy: t.base,
      maxOccupancy: t.max,
      baseRateCents: T(t.rate),
      extraAdultCents: t.extra ? T(t.extra) : undefined,
    });
    typeId.set(t.code, created.id);
  }
  for (const t of TYPES) {
    const ids = rooms
      .filter((r) => typeOfRoom(Math.floor(Number(r.label) / 100), Number(r.label) % 100) === t.code)
      .map((r) => r.id);
    typeCount.set(t.code, ids.length);
    await assignRoomType(db, ownerCtx, ids, typeId.get(t.code)!);
  }
  const planId = {
    BB: (
      await createRatePlan(db, ownerCtx, {
        code: "BB",
        name: "اقامت با صبحانه",
        mealPlan: "BB",
        adjustCents: T(650_000),
        isDefault: true,
      })
    ).id,
    RO: (await createRatePlan(db, ownerCtx, { code: "RO", name: "فقط اتاق", mealPlan: "RO" })).id,
    HB: (
      await createRatePlan(db, ownerCtx, {
        code: "HB",
        name: "نیم‌پانسیون",
        mealPlan: "HB",
        adjustCents: T(1_700_000),
        minStay: 2,
      })
    ).id,
    NRF: (
      await createRatePlan(db, ownerCtx, {
        code: "NRF",
        name: "غیرقابل استرداد",
        mealPlan: "BB",
        adjustBps: -1200,
        adjustCents: T(650_000),
        refundable: false,
        cancelHours: 0,
      })
    ).id,
    CORP: (
      await createRatePlan(db, ownerCtx, {
        code: "CORP",
        name: "قرارداد شرکتی",
        mealPlan: "BB",
        adjustBps: -1500,
        adjustCents: T(650_000),
        bookableOnline: false,
      })
    ).id,
  };

  for (const s of [
    {
      kind: "pool",
      name: "استخر سرپوشیده",
      durationMin: 60,
      priceCents: 0,
      capacity: 30,
      opensAt: "07:00",
      closesAt: "22:00",
      slotStepMin: 60,
    },
    {
      kind: "sauna",
      name: "سونا خشک و بخار",
      durationMin: 45,
      priceCents: 0,
      capacity: 10,
      opensAt: "07:00",
      closesAt: "22:00",
      slotStepMin: 45,
    },
    {
      kind: "massage",
      name: "ماساژ آرامش ۶۰ دقیقه",
      durationMin: 60,
      priceCents: T(3_500_000),
      capacity: 3,
      opensAt: "10:00",
      closesAt: "21:00",
      slotStepMin: 30,
    },
    {
      kind: "massage",
      name: "ماساژ سنگ داغ ۹۰ دقیقه",
      durationMin: 90,
      priceCents: T(5_200_000),
      capacity: 2,
      opensAt: "10:00",
      closesAt: "20:00",
      slotStepMin: 30,
    },
    {
      kind: "hammam",
      name: "حمام سنتی و کیسه",
      durationMin: 90,
      priceCents: T(2_500_000),
      capacity: 4,
      opensAt: "10:00",
      closesAt: "20:00",
      slotStepMin: 30,
    },
    {
      kind: "gym",
      name: "باشگاه بدنسازی",
      durationMin: 60,
      priceCents: 0,
      capacity: 20,
      opensAt: "06:00",
      closesAt: "23:00",
      slotStepMin: 60,
    },
    {
      kind: "beauty",
      name: "سالن زیبایی",
      durationMin: 60,
      priceCents: T(1_800_000),
      capacity: 2,
      opensAt: "10:00",
      closesAt: "20:00",
      slotStepMin: 60,
    },
  ] as const)
    await saveService(db, ownerCtx, null, { ...s, guestBookable: true, active: true });
  const services = await listServices(db, rid);
  const minibar = [];
  for (const [name, toman] of MINIBAR)
    minibar.push(await saveMinibarItem(db, ownerCtx, null, { name, priceCents: T(toman), parQty: 2 }));

  const accounts = [
    await saveAccount(db, ownerCtx, null, {
      name: "شرکت ملی نفت ایران",
      kind: "company",
      paymentTermsDays: 30,
      creditLimitCents: T(900_000_000),
    }),
    await saveAccount(db, ownerCtx, null, {
      name: "ایران‌خودرو",
      kind: "company",
      paymentTermsDays: 30,
      creditLimitCents: T(800_000_000),
    }),
    await saveAccount(db, ownerCtx, null, {
      name: "بانک ملت — امور اداری",
      kind: "company",
      paymentTermsDays: 15,
      creditLimitCents: T(800_000_000),
    }),
    await saveAccount(db, ownerCtx, null, {
      name: "آژانس مسافرتی پرواز آسمان",
      kind: "agency",
      paymentTermsDays: 15,
      creditLimitCents: T(600_000_000),
      commissionBps: 1000,
    }),
  ];

  // Restaurant: menu and stock.
  const [vat] = await db
    .select()
    .from(taxRates)
    .where(and(eq(taxRates.restaurantId, rid), eq(taxRates.rateBps, 1000)));
  const dishes: { id: string; price: number }[] = [];
  for (const [ci, [cat, items]] of MENU.entries()) {
    const [c] = await db
      .insert(categories)
      .values({ restaurantId: rid, name: cat, sortOrder: ci, icon: MENU_ICONS[cat] ?? null })
      .returning();
    for (const [pi, [name, toman]] of items.entries()) {
      const [p] = await db
        .insert(products)
        .values({
          restaurantId: rid,
          categoryId: c!.id,
          name,
          priceCents: T(toman),
          taxRateId: vat?.id,
          sortOrder: pi,
        })
        .returning();
      dishes.push({ id: p!.id, price: toman });
    }
  }
  // The hotel's restaurants and cafés, with their tables and their part of the menu.
  await ensureParsianOutlets(ownerCtx);
  restaurantTables = (await listTables(db, ownerCtx)).filter((p) => p.kind !== "room");
  const suppliers = [];
  for (const [name, phone] of [
    ["پخش مواد غذایی کاله", "02144000001"],
    ["گوشت و مرغ تهران", "02155000002"],
    ["نوشیدنی‌سازان", "02166000003"],
    ["تأمین‌کننده آمنیتی هتل", "02177000004"],
  ] as const)
    suppliers.push(await createSupplier(db, ownerCtx, { name, phone }));
  const stock: { id: string; name: string }[] = [];
  for (const [name, unit] of STOCK)
    stock.push(await createStockItem(db, ownerCtx, { name, unit, lowStockThreshold: 5 }));

  await savePricingRule(db, ownerCtx, null, { minOccupancyPct: 75, adjustBps: 800 });
  await savePricingRule(db, ownerCtx, null, { minOccupancyPct: 90, adjustBps: 2000 });
  await savePricingRule(db, ownerCtx, null, { minOccupancyPct: 0, withinDays: 1, adjustBps: -500 });

  const w: World = {
    rid,
    hotel,
    ownerCtx,
    desk,
    accountant,
    cashier,
    typeId,
    typeCount,
    planId,
    services,
    minibar,
    accounts,
    dishes,
    restaurantTables,
    suppliers,
    stock,
    guestIds: [],
  };

  // ── Time machine: start the hotel `days` ago ──────────────────────────────
  const today = localDay(new Date(), TZ);
  const day0 = addDays(today, -days);
  const horizon = addDays(today, 14);
  await db.update(pmsSettings).set({ businessDate: day0 }).where(eq(pmsSettings.restaurantId, rid));
  // Busy nights (Wednesday, Thursday) dearer on every room type.
  for (const t of TYPES)
    await setRateRange(db, ownerCtx, {
      roomTypeId: typeId.get(t.code)!,
      from: day0,
      to: addDays(horizon, 7),
      rateCents: T(Math.round((t.rate * 1.15) / 10_000) * 10_000),
      weekdays: [3, 4],
    });

  // ── Demand: who books what, when ──────────────────────────────────────────
  // A conference already picked up (rooming list) and one coming, held as a block.
  const pastBlock = {
    arrival: addDays(day0, 9),
    departure: addDays(day0, 12),
    rooms: 18,
    type: "DLX" as TypeCode,
  };
  const futureBlock = {
    arrival: addDays(today, 6),
    departure: addDays(today, 9),
    rooms: 15,
    type: "STE" as TypeCode,
  };
  const sold = new Map<string, number>();
  for (const b of [futureBlock, pastBlock])
    for (let x = b.arrival; x < b.departure; x = addDays(x, 1))
      sold.set(`${b.type}|${x}`, (sold.get(`${b.type}|${x}`) ?? 0) + b.rooms);
  const plan = planDemand(w, { from: day0, earliest: day0, today, horizon, sold });
  console.log(`  Parsian: ${plan.length} bookings planned over ${days + 15} days`);
  const sim = newSim(plan, day0);
  const { fail, stayIndex } = sim;
  let blockId: string | null = null;

  // ── Day by day ────────────────────────────────────────────────────────────
  for (let d = day0; d <= today; d = addDays(d, 1)) {
    await simulateDay(w, sim, d, {
      isToday: d === today,
      // The conference block and its rooming list, the wedding block (first build only).
      events: async () => {
        if (d === day0) {
          const block = await createBlock(db, ownerCtx, {
            name: "همایش سالانه صنعت پتروشیمی",
            accountId: accounts[0]!.id,
            contactName: "دبیرخانه همایش",
            arrival: pastBlock.arrival,
            departure: pastBlock.departure,
            releaseDate: addDays(pastBlock.arrival, -3),
            rateCents: T(5_900_000),
            rooms: [{ roomTypeId: typeId.get(pastBlock.type)!, rooms: pastBlock.rooms + 2 }],
          });
          blockId = block.id;
        }
        if (d === addDays(day0, 3) && blockId)
          for (let i = 0; i < pastBlock.rooms; i++) {
            const p: Planned = {
              type: pastBlock.type,
              arrival: pastBlock.arrival,
              departure: pastBlock.departure,
              bookingDay: d,
              adults: 1,
              children: 0,
              source: "direct",
              plan: "CORP",
              guarantee: "company",
              account: 0,
              status: "confirmed",
              cancelOn: null,
              noShow: false,
              repeat: false,
              eta: "16:00",
            };
            try {
              const s = await createStay(db, pick(desk), {
                guest: newGuest(),
                roomTypeId: typeId.get(p.type)!,
                accountId: accounts[0]!.id,
                blockId,
                arrival: p.arrival,
                departure: p.departure,
                adults: 1,
                source: "direct",
                guarantee: "company",
              });
              p.id = s.id;
              stayIndex.set(s.id, p);
            } catch (e) {
              fail("block", e);
            }
          }
        if (d === addDays(today, -4))
          await createBlock(db, ownerCtx, {
            name: "مراسم عروسی خانواده رحیمی",
            contactName: "آقای رحیمی",
            contactPhone: "09121112233",
            status: "tentative",
            arrival: futureBlock.arrival,
            departure: futureBlock.departure,
            releaseDate: addDays(futureBlock.arrival, -2),
            rateCents: T(9_800_000),
            rooms: [{ roomTypeId: typeId.get(futureBlock.type)!, rooms: futureBlock.rooms }],
          }).catch((e) => fail("block2", e));
      },
    });
  }

  await looseEnds(w, today, true);
  await allocate(w, today);
  await syncLedger(db, hotel);

  const [{ n: total } = { n: 0 }] = await db
    .select({ n: count() })
    .from(stays)
    .where(eq(stays.restaurantId, rid));
  console.log(
    `✓ Parsian test hotel: 300 rooms, ${total} bookings, ${days} closed days (${Math.round((Date.now() - started) / 1000)} s)`,
  );
  if (sim.errors.size) console.log("  skipped:", Object.fromEntries(sim.errors));
}

/**
 * One build at a time: during a redeploy the old and the new container both start this script.
 * A Postgres advisory lock, on its own connection, makes the second wait until the first is done
 * (or its container is stopped, which releases the lock), then it finds the hotel finished or
 * half-built and acts accordingly.
 */
async function withBuildLock<T>(run: () => Promise<T>) {
  const lock = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await lock.connect();
  try {
    await lock.query("select pg_advisory_lock(hashtext('spotihotel:parsian-seed'))");
    return await run();
  } finally {
    await lock.end().catch(() => {});
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const owner =
    process.env.SEED_PARSIAN_OWNER || process.env.SEED_SUPERADMIN_EMAIL || "owner@demo.spotihotel.local";
  const days = Number(process.env.PARSIAN_DAYS ?? 30) || 30;
  withBuildLock(() => seedParsian(owner, days))
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("✗ Parsian seed failed", e);
      process.exit(1);
    });
}
