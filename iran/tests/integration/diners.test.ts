import { randomBytes, randomInt } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { diners, orderItems, orders } from "@/server/db/schema";
import { setSmsDriver } from "@/server/infra/sms";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct, updateProduct } from "@/server/modules/menu/products";
import { createPosOrder } from "@/server/modules/pos/service";
import { dayJournal, localDate, rangeTotals, shiftDate } from "@/server/modules/diners/journal";
import {
  clearDinerHistory,
  createDinerSession,
  deleteDiner,
  loginWithEmail,
  requestPhoneCode,
  setCalorieTracking,
  signupWithEmail,
  updateDinerProfile,
  validateDinerSession,
  verifyPhoneCode,
} from "@/server/modules/diners/service";
import { createOwnerWithRestaurant, TEST_PASSWORD, uniqueEmail } from "../helpers/factories";

const key = () => randomBytes(12).toString("hex");
const phone = () => `09${randomInt(100_000_000, 999_999_999)}`;

/** Captures the texts sent, to read the sign-in code. */
function captureSms() {
  const sent: { to: string; text: string }[] = [];
  setSmsDriver({
    name: "test",
    async send(to, text) {
      sent.push({ to, text });
      return { ref: null };
    },
  });
  return {
    sent,
    code: () => /(\d{6})/.exec(sent.at(-1)?.text ?? "")?.[1] ?? "",
  };
}
afterEach(() => setSmsDriver(null));

async function menu() {
  const { ctx } = await createOwnerWithRestaurant("Nutri");
  const cat = await createCategory(db, ctx, { name: "غذای اصلی" });
  const kebab = await createProduct(db, ctx, {
    categoryId: cat.id,
    name: "چلو کباب",
    priceCents: 2000,
    caloriesKcal: 850,
    nutrition: { proteinG: 45, carbsG: 90, fatG: 30, fiberG: 3, saltG: 2.4 },
  });
  const tea = await createProduct(db, ctx, { categoryId: cat.id, name: "ویژه سرآشپز", priceCents: 100 });
  return { ctx, kebab, tea };
}

describe("diner accounts and nutrition journal", () => {
  it("signs in by SMS code, attaches past orders of that number and sums the day", async () => {
    const sms = captureSms();
    const { ctx, kebab, tea } = await menu();
    const mobile = phone();
    // Ordered before having an account, with the mobile number given at the till.
    const { order } = await createPosOrder(db, ctx, {
      lines: [
        { productId: kebab.id, quantity: 2 },
        { productId: tea.id, quantity: 1 },
      ],
      customerPhone: mobile,
      idempotencyKey: key(),
    });
    const lines = await db.select().from(orderItems).where(eq(orderItems.orderId, order.id));
    expect(lines.find((l) => l.productName === "چلو کباب")?.nutrition).toMatchObject({
      kcal: 850,
      proteinG: 45,
    });
    expect(lines.find((l) => l.productName === "ویژه سرآشپز")?.nutrition).toBeNull();

    await requestPhoneCode(db, mobile.replace(/^0/, "+98"));
    expect(sms.sent.at(-1)?.to).toBe(mobile);
    await expect(
      verifyPhoneCode(db, { phone: mobile, code: "000000" === sms.code() ? "111111" : "000000" }),
    ).rejects.toThrow("code_invalid");
    const diner = await verifyPhoneCode(db, { phone: mobile, code: sms.code() });
    expect(diner.phone).toBe(mobile);
    // Single use.
    await expect(verifyPhoneCode(db, { phone: mobile, code: sms.code() })).rejects.toThrow("code_expired");

    const [linked] = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(linked?.dinerId).toBe(diner.id);

    const today = localDate(new Date(), diner.timezone);
    const day = await dayJournal(db, diner, today);
    expect(day.meals).toHaveLength(1);
    expect(day.total).toMatchObject({ kcal: 1700, proteinG: 90, saltG: 4.8 });
    expect(day.unknownPortions).toBe(1);

    const week = await rangeTotals(db, diner, shiftDate(today, -6), today);
    expect(week).toHaveLength(7);
    expect(week.at(-1)).toMatchObject({ date: today, kcal: 1700, meals: 1 });
    expect(week[0]).toMatchObject({ kcal: 0, meals: 0 });

    // A later order with the verified number is attached at once.
    const { order: second } = await createPosOrder(db, ctx, {
      lines: [{ productId: kebab.id, quantity: 1 }],
      customerPhone: mobile,
      idempotencyKey: key(),
    });
    expect((await db.select().from(orders).where(eq(orders.id, second.id)))[0]?.dinerId).toBe(diner.id);

    // A changed recipe does not rewrite what was eaten.
    await updateProduct(db, ctx, kebab.id, {
      categoryId: kebab.categoryId,
      name: "چلو کباب",
      priceCents: 2000,
      caloriesKcal: 900,
      nutrition: { proteinG: 50 },
    });
    expect((await dayJournal(db, diner, today)).total.kcal).toBe(1700 + 850);

    // Clearing the history detaches everything, and logging in again does not bring it back.
    await clearDinerHistory(db, diner.id);
    expect((await dayJournal(db, diner, today)).meals).toHaveLength(0);
    await requestPhoneCode(db, mobile);
    await verifyPhoneCode(db, { phone: mobile, code: sms.code() });
    expect((await dayJournal(db, diner, today)).meals).toHaveLength(0);

    await deleteDiner(db, diner.id);
    expect(await db.select().from(diners).where(eq(diners.id, diner.id))).toHaveLength(0);
    expect((await db.select().from(orders).where(eq(orders.id, order.id)))[0]?.dinerId).toBeNull();
  });

  it("e-mail accounts: signup, login, sessions, goals, adding a phone", async () => {
    const sms = captureSms();
    const email = uniqueEmail("diner");
    const d = await signupWithEmail(db, { email, password: TEST_PASSWORD, name: "Sara" });
    await expect(
      signupWithEmail(db, { email: email.toUpperCase(), password: TEST_PASSWORD }),
    ).rejects.toThrow("email_taken");
    expect(await loginWithEmail(db, { email, password: "wrong-password" })).toBeNull();
    expect((await loginWithEmail(db, { email, password: TEST_PASSWORD }))?.id).toBe(d.id);

    const { token } = await createDinerSession(db, d.id);
    expect((await validateDinerSession(db, token))?.diner.id).toBe(d.id);
    expect(await validateDinerSession(db, "nope")).toBeNull();

    await updateDinerProfile(db, d.id, { goals: { kcal: 1800, proteinG: 90 } });
    expect((await db.select().from(diners).where(eq(diners.id, d.id)))[0]?.goals).toEqual({
      kcal: 1800,
      proteinG: 90,
    });

    // The phone of another account cannot be taken.
    const other = phone();
    await requestPhoneCode(db, other);
    await verifyPhoneCode(db, { phone: other, code: sms.code() });
    await requestPhoneCode(db, other);
    await expect(verifyPhoneCode(db, { phone: other, code: sms.code(), attachTo: d.id })).rejects.toThrow(
      "phone_taken",
    );

    const mine = phone();
    await requestPhoneCode(db, mine);
    const withPhone = await verifyPhoneCode(db, { phone: mine, code: sms.code(), attachTo: d.id });
    expect(withPhone).toMatchObject({ id: d.id, phone: mine });
  });

  it("asks whether to count calories and turns the body profile into daily goals", async () => {
    const d = await signupWithEmail(db, { email: uniqueEmail("cal"), password: TEST_PASSWORD });
    expect(d.trackCalories).toBeNull();
    await expect(
      setCalorieTracking(db, d.id, {
        track: true,
        body: { sex: "female", age: 8, weightKg: 60, heightCm: 165 },
      }),
    ).rejects.toThrow();
    const needs = await setCalorieTracking(db, d.id, {
      track: true,
      body: { sex: "female", age: 30, weightKg: 60, heightCm: 165, activity: "light", goal: "maintain" },
    });
    const [row] = await db.select().from(diners).where(eq(diners.id, d.id));
    expect(row).toMatchObject({ trackCalories: true, sex: "female", weightKg: 60, heightCm: 165 });
    expect(row!.goals).toEqual(needs!.goals);
    expect(row!.goals!.kcal).toBe(1820);

    // Goals typed by the diner win over a new calculation; emptying them goes back to it.
    await updateDinerProfile(db, d.id, { goals: { kcal: 1600 } });
    await setCalorieTracking(db, d.id, {
      track: true,
      body: { sex: "female", age: 30, weightKg: 70, heightCm: 165 },
    });
    expect((await db.select().from(diners).where(eq(diners.id, d.id)))[0]!.goals).toEqual({ kcal: 1600 });
    await updateDinerProfile(db, d.id, { goals: {} });
    const [back] = await db.select().from(diners).where(eq(diners.id, d.id));
    expect(back!.goalsManual).toBe(false);
    expect(back!.goals!.kcal).toBeGreaterThan(1820);

    await setCalorieTracking(db, d.id, { track: false });
    expect((await db.select().from(diners).where(eq(diners.id, d.id)))[0]!.trackCalories).toBe(false);
  });
});
