import { sql } from "drizzle-orm";
import { Client } from "pg";
import type { DbOrTx } from "@/server/db/client";

/**
 * Realtime events. Payloads only carry identifiers and small facts: subscribers re-read
 * authoritative data through the normal, permission-checked code paths.
 */
export type RealtimeEvent = {
  /** restaurant:{id} (staff screens), participant:{id} (one guest), session:{id} (everyone at a table) */
  topic: string;
  type:
    | "order.created"
    | "order.accepted"
    | "order.updated"
    | "session.opened"
    | "session.closed"
    | "notification.created"
    | "menu.updated"
    | "payment.updated"
    | "waiter.called"
    | "game.updated";
  data?: Record<string, string | number | boolean | null | string[]>;
};

export type Unsubscribe = () => void;

export interface RealtimeBus {
  subscribe(topic: string, handler: (event: RealtimeEvent) => void): Promise<Unsubscribe>;
}

export const PG_CHANNEL = "sf_events";

/**
 * Queues an event inside the current transaction. Postgres delivers NOTIFY only on commit,
 * so a rolled-back write never produces an event.
 */
export async function emit(tx: DbOrTx, event: RealtimeEvent) {
  await tx.execute(sql`select pg_notify(${PG_CHANNEL}, ${JSON.stringify(event)})`);
}

export const topics = {
  restaurant: (id: string) => `restaurant:${id}`,
  participant: (id: string) => `participant:${id}`,
  session: (id: string) => `session:${id}`,
  /** Games between the guests of a restaurant (lobby + boards). */
  games: (restaurantId: string) => `games:${restaurantId}`,
};

/**
 * One dedicated LISTEN connection per process (must be a direct connection: LISTEN does not
 * work through a transaction-mode pooler), fanned out in memory to subscribers.
 * Reconnects with backoff; subscribers keep their registration across reconnects.
 * For several app instances this already works (every instance LISTENs); swap for Redis
 * pub/sub only if Postgres becomes the bottleneck.
 */
export class PostgresRealtimeBus implements RealtimeBus {
  private client: Client | null = null;
  private connecting: Promise<void> | null = null;
  private handlers = new Map<string, Set<(e: RealtimeEvent) => void>>();
  private retry = 0;

  constructor(private connectionString: string) {}

  private async connect() {
    if (this.client) return;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      const client = new Client({ connectionString: this.connectionString });
      client.on("notification", (msg) => {
        if (msg.channel !== PG_CHANNEL || !msg.payload) return;
        let event: RealtimeEvent;
        try {
          event = JSON.parse(msg.payload) as RealtimeEvent;
        } catch {
          return;
        }
        for (const h of this.handlers.get(event.topic) ?? []) {
          try {
            h(event);
          } catch (e) {
            console.error("[realtime] handler failed", e);
          }
        }
      });
      const onDown = (err?: Error) => {
        if (this.client !== client) return;
        console.error("[realtime] listener lost", err?.message ?? "");
        this.client = null;
        client.removeAllListeners();
        client.end().catch(() => {});
        const delay = Math.min(30_000, 500 * 2 ** this.retry++);
        setTimeout(() => {
          if (this.handlers.size > 0) this.connect().catch(() => {});
        }, delay);
      };
      client.on("error", onDown);
      client.on("end", () => onDown());
      await client.connect();
      await client.query(`LISTEN ${PG_CHANNEL}`);
      this.client = client;
      this.retry = 0;
    })().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  async subscribe(topic: string, handler: (event: RealtimeEvent) => void): Promise<Unsubscribe> {
    let set = this.handlers.get(topic);
    if (!set) this.handlers.set(topic, (set = new Set()));
    set.add(handler);
    await this.connect();
    return () => {
      const s = this.handlers.get(topic);
      s?.delete(handler);
      if (s && s.size === 0) this.handlers.delete(topic);
    };
  }

  async close() {
    const c = this.client;
    this.client = null;
    this.handlers.clear();
    if (c) {
      c.removeAllListeners();
      await c.end().catch(() => {});
    }
  }
}

const globalForBus = globalThis as unknown as { __sfBus?: PostgresRealtimeBus };

export function realtimeBus(): RealtimeBus {
  return (globalForBus.__sfBus ??= new PostgresRealtimeBus(
    process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL!,
  ));
}
