import { expect, test } from "@playwright/test";
import { freeTableToken } from "./db";

test("health and home page", async ({ page, request }) => {
  const health = await request.get("/api/health");
  expect(await health.json()).toMatchObject({ ok: true });
  const res = await page.goto("/");
  expect(res?.status()).toBe(200);
  await expect(page.locator("h1").first()).toBeVisible();
});

test("a guest scans the QR, adds a dish and places the order", async ({ page }) => {
  const token = await freeTableToken();
  await page.goto(`/t/${token}`);
  await expect(page).toHaveURL(/\/table/);
  // The welcome splash fades after ~3 s; the menu is behind it.
  const add = page.locator('button[aria-label^="افزودن"], button[aria-label^="Add"]').first();
  await expect(add).toBeVisible({ timeout: 15_000 });
  await add.click();
  // Dishes with required choices open a sheet: confirm it if so.
  const sheetAdd = page.getByRole("dialog").getByRole("button", { name: /افزودن|Add/ });
  if (await sheetAdd.isVisible().catch(() => false)) await sheetAdd.click();
  await page.goto("/table/cart");
  await page.getByRole("button", { name: /ثبت سفارش|Place order/ }).click();
  await expect(page).toHaveURL(/\/table\/orders/, { timeout: 15_000 });
});

test("the public demo seats the visitor at a demo table", async ({ page }) => {
  await page.goto("/demo");
  await expect(page).toHaveURL(/\/table/, { timeout: 15_000 });
});
