import pg from "pg";

let pool;

const DEFAULT_POOL_MAX = 2;
const DEFAULT_CONNECTION_TIMEOUT_MS = 3000;
const DEFAULT_IDLE_TIMEOUT_MS = 10_000;
const DEFAULT_QUERY_TIMEOUT_MS = 10_000;
const DEFAULT_STATEMENT_TIMEOUT_MS = 10_000;
const DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MS = 10_000;

export function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) {
    pool = new pg.Pool(buildPoolConfig());
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

export function getPoolDebugInfo() {
  const activePool = pool ?? null;
  return {
    hasDatabaseUrl: hasDatabaseUrl(),
    config: getSanitizedPoolConfig(),
    stats: activePool
      ? {
          totalCount: activePool.totalCount,
          idleCount: activePool.idleCount,
          waitingCount: activePool.waitingCount,
        }
      : null,
  };
}

export async function checkDatabaseLatency() {
  const activePool = getPool();
  if (!activePool) return { ok: false, latencyMs: null };

  const startedAt = Date.now();
  try {
    const result = await activePool.query("select 1 as ok, current_database() as database_name");
    return {
      ok: result.rows[0]?.ok === 1,
      latencyMs: Date.now() - startedAt,
      databaseName: result.rows[0]?.database_name ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      errorCode: error?.code ?? null,
      errorMessage: safeMessage(error),
    };
  }
}

export function getSanitizedPoolConfig() {
  const config = buildPoolConfig();
  return {
    max: config.max,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    idleTimeoutMillis: config.idleTimeoutMillis,
    query_timeout: config.query_timeout,
    statement_timeout: config.statement_timeout,
    idle_in_transaction_session_timeout: config.idle_in_transaction_session_timeout,
    ssl: Boolean(config.ssl),
  };
}

function buildPoolConfig() {
  return {
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: readPositiveInt("PG_POOL_MAX", DEFAULT_POOL_MAX),
    connectionTimeoutMillis: readPositiveInt("PG_CONNECTION_TIMEOUT_MS", DEFAULT_CONNECTION_TIMEOUT_MS),
    idleTimeoutMillis: readPositiveInt("PG_IDLE_TIMEOUT_MS", DEFAULT_IDLE_TIMEOUT_MS),
    query_timeout: readPositiveInt("PG_QUERY_TIMEOUT_MS", DEFAULT_QUERY_TIMEOUT_MS),
    statement_timeout: readPositiveInt("PG_STATEMENT_TIMEOUT_MS", DEFAULT_STATEMENT_TIMEOUT_MS),
    idle_in_transaction_session_timeout: readPositiveInt(
      "PG_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS",
      DEFAULT_IDLE_IN_TRANSACTION_TIMEOUT_MS,
    ),
  };
}

function readPositiveInt(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function safeMessage(error) {
  const message = error?.message ?? "Database connection failed";
  const databaseUrl = process.env.DATABASE_URL;
  return databaseUrl ? message.replaceAll(databaseUrl, "[redacted]") : message;
}

export function resetPoolForTests() {
  const current = pool;
  pool = null;
  return current?.end?.();
}
