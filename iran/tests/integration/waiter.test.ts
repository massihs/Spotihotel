import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { printJobs, restaurantMembers, tableSessions } from "@/server/db/schema";
import { createCategory } from "@/server/modules/menu/categories";
import { createProduct } from "@/server/modules/menu/products";
import { createTable } from "@/server/modules/tables/service";
import { saveStation } from "@/server/modules/kitchen/stations";
import { setMemberJob } from "@/server/modules/members/service";
import { createPosOrder } from "@/server/modules/pos/service";
import { savePrinter } from "@/server/modules/printing/service";
import { getFloor } from "@/server/modules/floor/service";
import { openTableRounds } from "@/server/modules/waiter/service";
import { loadRestaurantContext } from "@/server/tenancy";
import { addMember, createOwnerWithRestaurant, createUser } from "../helpers/factories";

const key = () => randomUUID().replaceAll("-", "");

describe("waiter order pad", () => {
  it("seats the table, sends each station its ticket, and keeps the rounds together", async () => {
    const { ctx, restaurant } = await createOwnerWithRestaurant("Waiter Place", { plan: "professional" });
    const table = await createTable(db, ctx, { label: "7" });
    const mains = await createCategory(db, ctx, { name: "Mains" });
    const drinks = await createCategory(db, ctx, { name: "Drinks" });
    const kebab = await createProduct(db, ctx, { categoryId: mains.id, name: "کباب", priceCents: 2_500_000 });
    const tea = await createProduct(db, ctx, { categoryId: drinks.id, name: "چای", priceCents: 300_000 });
    const kitchen = await saveStation(db, ctx, null, {
      name: "آشپزخانه",
      color: "orange",
      categoryIds: [mains.id],
    });
    const bar = await saveStation(db, ctx, null, { name: "بار", color: "sky", categoryIds: [drinks.id] });
    await savePrinter(db, ctx, null, { name: "K", host: "10.0.0.5", target: "station", stationId: kitchen });
    await savePrinter(db, ctx, null, { name: "B", host: "10.0.0.6", target: "station", stationId: bar });

    // A waiter account (job preset), not the owner.
    const { user, sessionUser } = await createUser();
    await addMember(restaurant.id, user.id, "staff");
    const [m] = await db
      .select()
      .from(restaurantMembers)
      .where(and(eq(restaurantMembers.restaurantId, restaurant.id), eq(restaurantMembers.userId, user.id)));
    await setMemberJob(db, ctx, m!.id, { job: "waiter", stationId: null });
    const waiter = await loadRestaurantContext(db, sessionUser, restaurant.id);

    const first = await createPosOrder(db, waiter, {
      channel: "dine_in",
      tableId: table.id,
      lines: [
        { productId: kebab.id, quantity: 2, note: "بدون پیاز" },
        { productId: tea.id, quantity: 2 },
      ],
      idempotencyKey: key(),
    });
    expect(first.order.status).toBe("accepted");
    expect(first.order.tableSessionId).toBeTruthy();
    // Both stations print straight away: no till acceptance for a waiter's order.
    const jobs = await db.select().from(printJobs).where(eq(printJobs.orderId, first.order.id));
    expect(jobs.map((j) => j.kind)).toEqual(["station", "station"]);

    // The table is seated; a second round joins the same session.
    const floor = await getFloor(db, waiter);
    expect(floor.find((f) => f.id === table.id)?.state).toBe("in_progress");
    const second = await createPosOrder(db, waiter, {
      channel: "dine_in",
      tableId: table.id,
      lines: [{ productId: tea.id, quantity: 1 }],
      idempotencyKey: key(),
    });
    expect(second.order.tableSessionId).toBe(first.order.tableSessionId);
    const open = await db
      .select()
      .from(tableSessions)
      .where(and(eq(tableSessions.tableId, table.id), eq(tableSessions.status, "open")));
    expect(open).toHaveLength(1);

    const rounds = (await openTableRounds(db, waiter))[table.id]!;
    expect(rounds.map((r) => r.number)).toEqual([first.order.number, second.order.number]);
    expect(rounds[0]!.byMe).toBe(true);
    expect(rounds[0]!.items.find((i) => i.name === "کباب")).toMatchObject({ quantity: 2, note: "بدون پیاز" });
  });
});
