import pg from "pg";

/** A table QR token of the seeded demo restaurant whose table is free. */
export async function freeTableToken(): Promise<string> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ qr_token: string }>(
      `select t.qr_token from dining_tables t join restaurants r on r.id = t.restaurant_id
        where r.slug = 'restaurant-demo' and t.deleted_at is null and t.qr_enabled
          and not exists (select 1 from table_sessions s where s.table_id = t.id and s.status = 'open')
        order by t.sort_order desc limit 1`,
    );
    if (!rows[0]) throw new Error("no free demo table: run the seed with SEED_DEMO=true");
    return rows[0].qr_token;
  } finally {
    await client.end();
  }
}
