import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database, DbOrTx } from "@/server/db/client";
import { cartItems, carts, categories, outlets, products } from "@/server/db/schema";
import { AppError, conflict, notFound } from "@/server/errors";
import { roomServiceOutlets } from "@/server/modules/outlets/service";
import { isUuid } from "@/lib/ids";
import { touchSession, type GuestContext } from "@/server/modules/guest/sessions";
import { loadPricedProducts, type PublicProduct } from "@/server/modules/menu/public";
import {
  computeTotals,
  lineKey,
  MAX_LINE_QUANTITY,
  priceLine,
  type LineError,
  type PricedLine,
} from "@/server/modules/pricing";

export const addItemSchema = z.object({
  productId: z.uuid(),
  optionValueIds: z.array(z.uuid()).max(40).default([]),
  quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY).default(1),
  note: z
    .string()
    .trim()
    .max(280)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  /** A hotel room: the restaurant or café whose menu the guest is ordering from. */
  outletId: z.uuid().nullable().optional(),
});
export type AddItemInput = z.input<typeof addItemSchema>;

async function getOrCreateCart(tx: DbOrTx, ctx: GuestContext) {
  const [existing] = await tx.select().from(carts).where(eq(carts.participantId, ctx.participant.id));
  if (existing) return existing;
  const [created] = await tx
    .insert(carts)
    .values({
      restaurantId: ctx.restaurant.id,
      tableSessionId: ctx.session.id,
      participantId: ctx.participant.id,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [again] = await tx.select().from(carts).where(eq(carts.participantId, ctx.participant.id));
  return again!;
}

function lineErrorCode(e: LineError) {
  return e.code;
}

/** Adds a line after validating it against current database prices; identical lines are merged. */
export async function addToCart(db: Database, ctx: GuestContext, raw: AddItemInput) {
  const input = addItemSchema.parse(raw);
  const [product] = await loadPricedProducts(db, ctx.restaurant.id, { productIds: [input.productId] });
  if (!product) throw new AppError("NOT_FOUND", "product_unavailable");
  const priced = priceLine(product, input.optionValueIds, input.quantity);
  if (!priced.ok) throw new AppError("VALIDATION", lineErrorCode(priced.error), { ...priced.error });

  return db.transaction(async (tx) => {
    const cart = await getOrCreateCart(tx, ctx);
    const items = await tx.select().from(cartItems).where(eq(cartItems.cartId, cart.id));
    // A room orders from one of the hotel's outlets at a time: its kitchen gets the order.
    if (ctx.table.kind === "room") {
      const outletId = await roomOutletFor(tx, ctx, input.outletId ?? cart.outletId ?? null);
      if (outletId) {
        if (items.length && cart.outletId && cart.outletId !== outletId) throw conflict("cart_other_outlet");
        await assertProductInOutlet(tx, ctx.restaurant.id, input.productId, outletId);
        if (cart.outletId !== outletId) await tx.update(carts).set({ outletId }).where(eq(carts.id, cart.id));
      }
    }
    const key = lineKey(input.productId, input.optionValueIds, input.note);
    const same = items.find((i) => lineKey(i.productId, i.optionValueIds, i.note) === key);
    if (same) {
      const quantity = Math.min(MAX_LINE_QUANTITY, same.quantity + input.quantity);
      await tx.update(cartItems).set({ quantity }).where(eq(cartItems.id, same.id));
    } else {
      await tx.insert(cartItems).values({
        restaurantId: ctx.restaurant.id,
        cartId: cart.id,
        productId: input.productId,
        quantity: input.quantity,
        optionValueIds: priced.line.selections.map((s) => s.valueId),
        note: input.note ?? null,
      });
    }
    await touchSession(tx, ctx.session.id);
  });
}

/** The room-service outlet asked for (or the first one), null when the hotel has none. */
async function roomOutletFor(tx: DbOrTx, ctx: GuestContext, asked: string | null) {
  const list = await roomServiceOutlets(tx, ctx.restaurant.id);
  if (!list.length) return null;
  return list.find((o) => o.id === asked)?.id ?? list[0]!.id;
}

/** A dish of another outlet's menu cannot go in this outlet's order (shared sections can). */
async function assertProductInOutlet(tx: DbOrTx, restaurantId: string, productId: string, outletId: string) {
  const [row] = await tx
    .select({ outletIds: categories.outletIds })
    .from(products)
    .innerJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.id, productId), eq(products.restaurantId, restaurantId)));
  if (row && row.outletIds.length && !row.outletIds.includes(outletId))
    throw new AppError("VALIDATION", "product_other_outlet");
}

/**
 * The room guest switches restaurant with a cart from another one: the cart is emptied (they
 * confirmed) and now belongs to the outlet chosen.
 */
export async function switchCartOutlet(db: Database, ctx: GuestContext, outletId: string) {
  if (ctx.table.kind !== "room" || !isUuid(outletId)) throw notFound();
  await db.transaction(async (tx) => {
    const [o] = await tx
      .select({ id: outlets.id })
      .from(outlets)
      .where(
        and(
          eq(outlets.id, outletId),
          eq(outlets.restaurantId, ctx.restaurant.id),
          eq(outlets.roomService, true),
          eq(outlets.isActive, true),
          isNull(outlets.deletedAt),
        ),
      );
    if (!o) throw notFound();
    const cart = await getOrCreateCart(tx, ctx);
    await tx.delete(cartItems).where(eq(cartItems.cartId, cart.id));
    await tx.update(carts).set({ outletId }).where(eq(carts.id, cart.id));
  });
}

async function loadOwnItem(tx: DbOrTx, ctx: GuestContext, itemId: string) {
  if (!isUuid(itemId)) throw notFound();
  const [row] = await tx
    .select({ item: cartItems })
    .from(cartItems)
    .innerJoin(carts, eq(carts.id, cartItems.cartId))
    .where(and(eq(cartItems.id, itemId), eq(carts.participantId, ctx.participant.id)));
  // Another participant's item is indistinguishable from a missing one.
  if (!row) throw notFound();
  return row.item;
}

export async function setCartItemQuantity(db: Database, ctx: GuestContext, itemId: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_LINE_QUANTITY) {
    throw new AppError("VALIDATION", "invalid_quantity");
  }
  await db.transaction(async (tx) => {
    await loadOwnItem(tx, ctx, itemId);
    if (quantity === 0) await tx.delete(cartItems).where(eq(cartItems.id, itemId));
    else await tx.update(cartItems).set({ quantity }).where(eq(cartItems.id, itemId));
  });
}

export async function setCartItemNote(db: Database, ctx: GuestContext, itemId: string, note: string) {
  const value = note.trim().slice(0, 280);
  await db.transaction(async (tx) => {
    await loadOwnItem(tx, ctx, itemId);
    await tx
      .update(cartItems)
      .set({ note: value === "" ? null : value })
      .where(eq(cartItems.id, itemId));
  });
}

export async function removeCartItem(db: Database, ctx: GuestContext, itemId: string) {
  await setCartItemQuantity(db, ctx, itemId, 0);
}

export type CartLineView = {
  id: string;
  productId: string;
  name: string;
  image: string | null;
  quantity: number;
  note: string | null;
  line: PricedLine | null;
  /** Set when the line can no longer be ordered as is (sold out, option removed…). */
  issue: string | null;
};

/** Re-prices every line from the database: the cart never trusts stored or client prices. */
export async function getCartView(db: Database, ctx: GuestContext) {
  const [cart] = await db.select().from(carts).where(eq(carts.participantId, ctx.participant.id));
  const items = cart
    ? await db.select().from(cartItems).where(eq(cartItems.cartId, cart.id)).orderBy(asc(cartItems.createdAt))
    : [];
  const productList = await loadPricedProducts(db, ctx.restaurant.id, {
    productIds: [...new Set(items.map((i) => i.productId))],
  });
  const byId = new Map<string, PublicProduct>(productList.map((p) => [p.id, p]));

  const lines: CartLineView[] = items.map((i) => {
    const product = byId.get(i.productId);
    if (!product) {
      return {
        id: i.id,
        productId: i.productId,
        name: "",
        image: null,
        quantity: i.quantity,
        note: i.note,
        line: null,
        issue: "product_unavailable",
      };
    }
    const priced = priceLine(product, i.optionValueIds, i.quantity);
    return {
      id: i.id,
      productId: i.productId,
      name: product.name,
      image: product.images[0]?.sm ?? null,
      quantity: i.quantity,
      note: i.note,
      line: priced.ok ? priced.line : null,
      issue: priced.ok ? null : priced.error.code,
    };
  });
  const valid = lines.filter((l) => l.line).map((l) => l.line!);
  const [outlet] =
    cart?.outletId && items.length
      ? await db
          .select({ id: outlets.id, name: outlets.name })
          .from(outlets)
          .where(inArray(outlets.id, [cart.outletId]))
      : [];
  return {
    /** A room's cart: the restaurant or café it orders from. */
    outlet: outlet ?? null,
    lines,
    itemCount: valid.reduce((n, l) => n + l.quantity, 0),
    totals: computeTotals(valid, ctx.restaurant.pricesIncludeTax),
    hasIssues: lines.some((l) => l.issue),
  };
}
