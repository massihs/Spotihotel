import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { mapRows, parseCsv, readSpreadsheet } from "@/server/modules/menu/import";

function xlsx(rows: (string | number)[][]) {
  const strings: string[] = [];
  const sheetRows = rows
    .map((r, i) => {
      const cells = r
        .map((v, j) => {
          const ref = `${String.fromCharCode(65 + j)}${i + 1}`;
          if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
          strings.push(v);
          return `<c r="${ref}" t="s"><v>${strings.length - 1}</v></c>`;
        })
        .join("");
      return `<row r="${i + 1}">${cells}</row>`;
    })
    .join("");
  return zipSync({
    "xl/sharedStrings.xml": strToU8(
      `<sst>${strings.map((s) => `<si><t>${s.replace(/&/g, "&amp;")}</t></si>`).join("")}</sst>`,
    ),
    "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData>${sheetRows}</sheetData></worksheet>`),
  });
}

describe("menu import", () => {
  it("reads CSV with quotes, semicolons and a BOM", () => {
    expect(parseCsv('﻿a;"b;c";"say ""hi"""\r\n1;2;3')).toEqual([
      ["a", "b;c", 'say "hi"'],
      ["1", "2", "3"],
    ]);
  });

  it("maps Persian headers, tomans with separators, repeated categories", () => {
    const rows = mapRows(
      [
        ["نام غذا", "دسته‌بندی", "قیمت", "توضیحات"],
        ["کباب کوبیده", "غذای اصلی", "۳۵۰٬۰۰۰ تومان", "دو سیخ"],
        ["جوجه کباب", "", "320000", ""],
        ["", "نوشیدنی", "50000", ""],
        ["دوغ", "نوشیدنی", "رایگان", ""],
      ],
      "IRR",
    );
    expect(rows[0]).toMatchObject({
      line: 2,
      name: "کباب کوبیده",
      category: "غذای اصلی",
      priceCents: 350_000_000,
      error: null,
    });
    expect(rows[1]).toMatchObject({ category: "غذای اصلی", priceCents: 320_000_000, description: null });
    expect(rows[2]!.error).toBe("missing_name");
    expect(rows[3]!.error).toBe("bad_price");
  });

  it("without headers takes category, name, price, description in order", () => {
    const rows = mapRows([["Plats", "Steak", "19,50", "Grillé"]], "EUR");
    expect(rows[0]).toMatchObject({
      line: 1,
      category: "Plats",
      name: "Steak",
      priceCents: 1950,
      description: "Grillé",
    });
  });

  it("reads the first sheet of an .xlsx", () => {
    const rows = readSpreadsheet(
      xlsx([
        ["Category", "Name", "Price"],
        ["Drinks", "Tea & lemon", 40000],
      ]),
    );
    expect(rows).toEqual([
      ["Category", "Name", "Price"],
      ["Drinks", "Tea & lemon", "40000"],
    ]);
  });
});
