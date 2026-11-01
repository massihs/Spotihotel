import { expect, test } from "@playwright/test";

test("the admin signs in and opens the platform overview", async ({ page }) => {
  const password = process.env.SEED_SUPERADMIN_PASSWORD;
  test.skip(!password, "SEED_SUPERADMIN_PASSWORD not set");
  await page.goto("/login");
  await page.fill("input[type=email]", process.env.SEED_SUPERADMIN_EMAIL ?? "admin@spotifood.local");
  await page.fill("input[type=password]", password!);
  await page.locator("button[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.endsWith("/login"), { timeout: 20_000 });
  await page.goto("/admin");
  await expect(page.locator("h1").first()).toBeVisible();
  await page.goto("/admin/errors");
  await expect(page.locator("h1").first()).toBeVisible();
});
