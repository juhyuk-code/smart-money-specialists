import test from "node:test";
import assert from "node:assert/strict";

test("database pool debug info exposes sanitized env-driven config", async () => {
  const originalEnv = snapshotEnv();
  process.env.DATABASE_URL = "postgres://user:secret@example.test:5432/app";
  process.env.PG_POOL_MAX = "4";
  process.env.PG_CONNECTION_TIMEOUT_MS = "1234";
  process.env.PG_IDLE_TIMEOUT_MS = "2345";
  process.env.PG_QUERY_TIMEOUT_MS = "3456";
  process.env.PG_STATEMENT_TIMEOUT_MS = "4567";
  process.env.PG_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS = "5678";

  try {
    const db = await import(`../src/services/db.js?case=config-${Date.now()}`);
    const info = db.getPoolDebugInfo();

    assert.equal(info.hasDatabaseUrl, true);
    assert.deepEqual(info.config, {
      max: 4,
      connectionTimeoutMillis: 1234,
      idleTimeoutMillis: 2345,
      query_timeout: 3456,
      statement_timeout: 4567,
      idle_in_transaction_session_timeout: 5678,
      ssl: true,
    });
    assert.equal(info.stats, null);
    assert.equal(JSON.stringify(info).includes("secret"), false);
  } finally {
    restoreEnv(originalEnv);
  }
});

test("database pool debug info falls back to small safe defaults", async () => {
  const originalEnv = snapshotEnv();
  process.env.DATABASE_URL = "postgres://user:secret@example.test:5432/app";
  process.env.PG_POOL_MAX = "not-a-number";
  process.env.PG_CONNECTION_TIMEOUT_MS = "0";
  delete process.env.PG_IDLE_TIMEOUT_MS;
  delete process.env.PG_QUERY_TIMEOUT_MS;
  delete process.env.PG_STATEMENT_TIMEOUT_MS;
  delete process.env.PG_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS;

  try {
    const db = await import(`../src/services/db.js?case=defaults-${Date.now()}`);
    const config = db.getSanitizedPoolConfig();

    assert.equal(config.max, 2);
    assert.equal(config.connectionTimeoutMillis, 3000);
    assert.equal(config.idleTimeoutMillis, 10_000);
    assert.equal(config.query_timeout, 10_000);
    assert.equal(config.statement_timeout, 10_000);
    assert.equal(config.idle_in_transaction_session_timeout, 10_000);
  } finally {
    restoreEnv(originalEnv);
  }
});

function snapshotEnv() {
  return {
    DATABASE_URL: process.env.DATABASE_URL,
    PG_POOL_MAX: process.env.PG_POOL_MAX,
    PG_CONNECTION_TIMEOUT_MS: process.env.PG_CONNECTION_TIMEOUT_MS,
    PG_IDLE_TIMEOUT_MS: process.env.PG_IDLE_TIMEOUT_MS,
    PG_QUERY_TIMEOUT_MS: process.env.PG_QUERY_TIMEOUT_MS,
    PG_STATEMENT_TIMEOUT_MS: process.env.PG_STATEMENT_TIMEOUT_MS,
    PG_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS: process.env.PG_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS,
  };
}

function restoreEnv(snapshot) {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
