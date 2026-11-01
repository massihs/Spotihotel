import { bigint, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";

/** Primary key: UUID v7 (time-ordered, index-friendly, not guessable). */
export const pk = () =>
  uuid()
    .primaryKey()
    .$defaultFn(() => uuidv7());

export const tstz = () => timestamp({ withTimezone: true, mode: "date" });

export const timestamps = {
  createdAt: tstz().notNull().defaultNow(),
  updatedAt: tstz()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const softDelete = {
  deletedAt: tstz(),
};

/**
 * Money in minor units (cents). 64-bit: Rial amounts (IRR) overflow a 32-bit integer
 * after ~21 million rials. Read back as a JS number (exact up to 2^53).
 */
export const money = () => bigint({ mode: "number" });
