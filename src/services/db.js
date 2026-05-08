import pg from "pg";

let pool;

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: Number(process.env.PG_POOL_MAX ?? 2),
    });
    pool.on("error", (error) => {
      console.warn("Postgres pool connection error", error?.code ?? "", error?.message ?? String(error));
    });
  }
  return pool;
}

export async function query(text, params = []) {
  const client = getPool();
  if (!client) return null;
  return client.query(text, params);
}

export function resetPoolForTests() {
  const current = pool;
  pool = null;
  return current?.end?.();
}
