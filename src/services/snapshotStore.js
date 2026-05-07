import pg from "pg";

const TABLE_NAME = "market_snapshots";

let pool;
let schemaReady;

export function hasDatabaseSnapshotStore() {
  return Boolean(process.env.DATABASE_URL);
}

export async function saveMarketSnapshot(key, payload) {
  const client = getPool();
  if (!client) return null;
  await ensureSchema();
  const result = await client.query(
    `
      insert into ${TABLE_NAME} (key, payload, created_at, updated_at)
      values ($1, $2::jsonb, now(), now())
      on conflict (key)
      do update set payload = excluded.payload, updated_at = now()
      returning updated_at
    `,
    [key, JSON.stringify(payload)],
  );
  return {
    cachedAt: result.rows[0]?.updated_at?.toISOString?.() ?? new Date().toISOString(),
    value: payload,
  };
}

export async function readMarketSnapshot(key) {
  const client = getPool();
  if (!client) return null;
  await ensureSchema();
  const result = await client.query(
    `select payload, updated_at from ${TABLE_NAME} where key = $1 limit 1`,
    [key],
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    value: row.payload,
    cachedAt: row.updated_at?.toISOString?.() ?? new Date().toISOString(),
  };
}

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 1,
    });
  }
  return pool;
}

async function ensureSchema() {
  if (schemaReady) return schemaReady;
  const client = getPool();
  if (!client) return null;
  schemaReady = client.query(`
    create table if not exists ${TABLE_NAME} (
      key text primary key,
      payload jsonb not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    )
  `);
  return schemaReady;
}
