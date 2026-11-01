import { and, eq, isNull, sql } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import type { Database } from "@/server/db/client";
import { categories, products } from "@/server/db/schema";
import { normalizeDigits, parseMoneyInput } from "@/lib/money";
import { validation } from "@/server/errors";
import { assertCan, type RestaurantContext } from "@/server/tenancy";
import { createCategory } from "./categories";
import { createProduct } from "./products";

/**
 * Menu import from a spreadsheet: CSV (any of , ; tab) or Excel .xlsx (first sheet).
 * Columns, found by their header in fa / fr / en / ar, else taken in this order:
 * category, name, price (in the restaurant's display unit: tomans in Iran), description.
 */
export const MAX_IMPORT_ROWS = 1000;
const MAX_BYTES = 5 * 1024 * 1024;

// ── Reading ───────────────────────────────────────────────────────────────────

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = [";", "\t", ","].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  );
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]!;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const xmlText = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&");

const colIndex = (ref: string) => {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

/** First worksheet of an .xlsx, as rows of strings. */
export function parseXlsx(bytes: Uint8Array): string[][] {
  const files = unzipSync(bytes, {
    filter: (f) => f.name === "xl/sharedStrings.xml" || f.name.startsWith("xl/worksheets/sheet"),
  });
  const shared: string[] = [];
  const ss = files["xl/sharedStrings.xml"];
  if (ss) for (const m of strFromU8(ss).matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(xmlText(m[1]!));
  const sheetName = Object.keys(files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))[0];
  if (!sheetName) throw validation("import_unreadable");
  const xml = strFromU8(files[sheetName]!);
  const rows: string[][] = [];
  for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    let next = 0;
    for (const c of r[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]!;
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
      const idx = ref ? colIndex(ref) : next;
      const type = attrs.match(/\bt="(\w+)"/)?.[1];
      const body = c[2] ?? "";
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = "";
      if (type === "s" && v !== undefined) value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = xmlText(body.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? "");
      else if (v !== undefined) value = xmlText(v);
      row[idx] = value;
      next = idx + 1;
    }
    rows.push(Array.from(row, (x) => x ?? ""));
  }
  return rows;
}

export function readSpreadsheet(bytes: Uint8Array): string[][] {
  if (bytes.byteLength > MAX_BYTES) throw validation("import_too_big");
  // .xlsx is a zip ("PK"); anything else is read as UTF-8 text.
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    try {
      return parseXlsx(bytes);
    } catch {
      throw validation("import_unreadable");
    }
  }
  return parseCsv(new TextDecoder("utf-8").decode(bytes));
}

// ── Mapping ───────────────────────────────────────────────────────────────────

const HEADERS: Record<"category" | "name" | "price" | "description", string[]> = {
  category: [
    "category",
    "categorie",
    "catégorie",
    "rubrique",
    "دسته",
    "دستهبندی",
    "دسته‌بندی",
    "گروه",
    "الفئة",
    "القسم",
  ],
  name: [
    "name",
    "nom",
    "plat",
    "produit",
    "item",
    "dish",
    "نام",
    "نامغذا",
    "نام غذا",
    "غذا",
    "الاسم",
    "الصنف",
  ],
  price: ["price", "prix", "قیمت", "قیمت(تومان)", "مبلغ", "السعر"],
  description: ["description", "desc", "détails", "توضیحات", "شرح", "الوصف"],
};
const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[\s‌_\-:]/g, "");

export type ImportRow = {
  line: number;
  category: string;
  name: string;
  priceCents: number | null;
  description: string | null;
  error: "missing_name" | "missing_category" | "bad_price" | null;
};

export function mapRows(rows: string[][], currency: string): ImportRow[] {
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (nonEmpty.length === 0) return [];
  const header = nonEmpty[0]!.map(norm);
  const find = (k: keyof typeof HEADERS) => header.findIndex((h) => HEADERS[k].map(norm).includes(h));
  let cols = {
    category: find("category"),
    name: find("name"),
    price: find("price"),
    description: find("description"),
  };
  let body = nonEmpty.slice(1);
  let firstLine = 2;
  if (cols.name < 0 || cols.price < 0) {
    cols = { category: 0, name: 1, price: 2, description: 3 };
    body = nonEmpty;
    firstLine = 1;
  }
  let lastCategory = "";
  return body.slice(0, MAX_IMPORT_ROWS).map((r, i) => {
    const get = (c: number) => (c >= 0 ? (r[c] ?? "").trim() : "");
    // An empty category cell repeats the one above (grouped sheets).
    const category = (get(cols.category) || lastCategory).slice(0, 80);
    if (category) lastCategory = category;
    const name = get(cols.name).slice(0, 120);
    const rawPrice = normalizeDigits(get(cols.price)).replace(/(تومان|toman|ریال|€|eur|\s)/gi, "");
    const priceCents = rawPrice === "" ? null : parseMoneyInput(rawPrice, currency);
    const description = get(cols.description).slice(0, 1000) || null;
    const error = !name
      ? "missing_name"
      : !category
        ? "missing_category"
        : priceCents === null
          ? "bad_price"
          : null;
    return { line: firstLine + i, category, name, priceCents, description, error };
  });
}

// ── Preview / apply ───────────────────────────────────────────────────────────

async function existing(db: Database, rid: string) {
  const [cats, prods] = await Promise.all([
    db
      .select({ id: categories.id, name: categories.name })
      .from(categories)
      .where(and(eq(categories.restaurantId, rid), isNull(categories.deletedAt))),
    db
      .select({ categoryId: products.categoryId, name: sql<string>`lower(${products.name})` })
      .from(products)
      .where(and(eq(products.restaurantId, rid), isNull(products.deletedAt))),
  ]);
  const catByName = new Map(cats.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const prodKeys = new Set(prods.map((p) => `${p.categoryId}\n${p.name.trim()}`));
  return { catByName, prodKeys };
}

export async function previewMenuImport(db: Database, ctx: RestaurantContext, bytes: Uint8Array) {
  assertCan(ctx, "menu.manage");
  const rows = mapRows(readSpreadsheet(bytes), ctx.restaurant.currency);
  if (rows.length === 0) throw validation("import_empty");
  const { catByName, prodKeys } = await existing(db, ctx.restaurant.id);
  const newCategories = [
    ...new Set(
      rows.filter((r) => !r.error && !catByName.has(r.category.toLowerCase())).map((r) => r.category),
    ),
  ];
  const marked = rows.map((r) => {
    const cid = catByName.get(r.category.toLowerCase());
    return { ...r, duplicate: !r.error && !!cid && prodKeys.has(`${cid}\n${r.name.toLowerCase()}`) };
  });
  return { rows: marked, newCategories };
}

/** Creates the missing categories and the dishes; dishes already in the menu are skipped. */
export async function applyMenuImport(db: Database, ctx: RestaurantContext, bytes: Uint8Array) {
  assertCan(ctx, "menu.manage");
  const rows = mapRows(readSpreadsheet(bytes), ctx.restaurant.currency).filter((r) => !r.error);
  if (rows.length === 0) throw validation("import_empty");
  const { catByName, prodKeys } = await existing(db, ctx.restaurant.id);
  let created = 0;
  let skipped = 0;
  let newCategories = 0;
  for (const r of rows) {
    const key = r.category.toLowerCase();
    let cid = catByName.get(key);
    if (!cid) {
      cid = (await createCategory(db, ctx, { name: r.category })).id;
      catByName.set(key, cid);
      newCategories++;
    }
    const pkey = `${cid}\n${r.name.toLowerCase()}`;
    if (prodKeys.has(pkey)) {
      skipped++;
      continue;
    }
    await createProduct(db, ctx, {
      categoryId: cid,
      name: r.name,
      priceCents: r.priceCents!,
      description: r.description ?? undefined,
    });
    prodKeys.add(pkey);
    created++;
  }
  return { created, skipped, newCategories };
}
