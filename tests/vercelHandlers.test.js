import test from "node:test";
import assert from "node:assert/strict";

test("markets handler falls back to mock data when Preference returns no markets", async () => {
  process.env.DATA_SOURCE = "mock";
  const { resetAppContextForTests } = await import("../src/appContext.js");
  resetAppContextForTests();
  const { default: handler } = await import(`../api/smart-money/markets.js?case=${Date.now()}`);

  const response = createResponse();
  await handler({}, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.dataSource, "mock");
  assert.ok(response.body.markets.length > 0);
});

test("live refresh handler supports explicit cohort exposure mode", async () => {
  process.env.DATA_SOURCE = "polymarket";
  process.env.POLYMARKET_COHORT_EXPOSURE_LIMIT = "2";
  process.env.POLYMARKET_COHORT_MARKET_LIMIT = "10";
  const originalFetch = globalThis.fetch;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalJobSecret = process.env.JOB_SECRET;
  process.env.JOB_SECRET = "job-secret";
  delete process.env.DATABASE_URL;
  const walletA = "0xaaa0000000000000000000000000000000000001";
  const walletB = "0xbbb0000000000000000000000000000000000002";
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/v1/leaderboard") {
      return jsonResponse([
        { rank: 1, proxyWallet: walletA, pnl: 1000, vol: 5000 },
        { rank: 200, proxyWallet: walletB, pnl: 500, vol: 2500 },
      ]);
    }
    if (parsed.pathname === "/positions") {
      const wallet = parsed.searchParams.get("user");
      return jsonResponse([
        {
          proxyWallet: wallet,
          conditionId: "condition-1",
          title: "Will the cohort hold this market?",
          slug: "cohort-market",
          outcome: wallet === walletA ? "YES" : "NO",
          size: 100,
          avgPrice: 0.5,
          curPrice: 0.5,
          currentValue: 50,
        },
      ]);
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  try {
    const { clearCache, setCachedValue } = await import("../src/cache.js");
    const { resetAppContextForTests } = await import("../src/appContext.js");
    clearCache();
    setCachedValue("smart-money-markets", "polymarket", {
      dataSource: "polymarket",
      mode: "live",
      registryRefreshedAt: null,
      markets: [{ conditionId: "stale-market", outcomes: [] }],
    }, 120_000);
    resetAppContextForTests();
    const { default: handler } = await import(`../api/smart-money/live/refresh.js?case=cohort-${Date.now()}`);
    const response = createResponse();
    await handler({
      headers: { "x-job-secret": "job-secret" },
      query: { mode: "cohort-exposure", cohortLimit: "2", marketLimit: "10", positionPageLimit: "1" },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.dataSource, "polymarket");
    assert.equal(response.body.mode, "cohort_exposure");
    assert.equal(response.body.cohort.walletsProcessed, 2);
    assert.equal(response.body.markets[0].exposureRank.cohortWalletCount, 2);

    const { default: marketsHandler } = await import(`../api/smart-money/markets.js?case=cohort-markets-${Date.now()}`);
    const marketsResponse = createResponse();
    await marketsHandler({ query: {} }, marketsResponse);

    assert.equal(marketsResponse.statusCode, 200);
    assert.equal(marketsResponse.body.mode, "cohort_exposure");
    assert.equal(marketsResponse.body.markets[0].conditionId, "condition-1");
    assert.equal(marketsResponse.body.markets[0].exposureRank.cohortWalletCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
    else delete process.env.DATABASE_URL;
    if (originalJobSecret) process.env.JOB_SECRET = originalJobSecret;
    else delete process.env.JOB_SECRET;
    delete process.env.POLYMARKET_COHORT_EXPOSURE_LIMIT;
    delete process.env.POLYMARKET_COHORT_MARKET_LIMIT;
  }
});

test("markets handler generates cohort exposure by default for Polymarket without a database snapshot", async () => {
  process.env.DATA_SOURCE = "polymarket";
  process.env.POLYMARKET_COHORT_EXPOSURE_LIMIT = "2";
  process.env.POLYMARKET_COHORT_MARKET_LIMIT = "10";
  const originalFetch = globalThis.fetch;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  const walletA = "0xaaa0000000000000000000000000000000000001";
  const walletB = "0xbbb0000000000000000000000000000000000002";
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname === "/v1/leaderboard") {
      return jsonResponse([
        { rank: 1, proxyWallet: walletA, pnl: 1000, vol: 5000 },
        { rank: 200, proxyWallet: walletB, pnl: 500, vol: 2500 },
      ]);
    }
    if (parsed.pathname === "/positions") {
      const wallet = parsed.searchParams.get("user");
      return jsonResponse([
        {
          proxyWallet: wallet,
          conditionId: "condition-1",
          title: "Will the default endpoint use cohort exposure?",
          slug: "cohort-default-market",
          outcome: wallet === walletA ? "YES" : "NO",
          size: 100,
          avgPrice: 0.5,
          curPrice: 0.5,
          currentValue: 50,
        },
      ]);
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  try {
    const { clearCache } = await import("../src/cache.js");
    const { resetAppContextForTests } = await import("../src/appContext.js");
    clearCache();
    resetAppContextForTests();
    const { default: marketsHandler } = await import(`../api/smart-money/markets.js?case=default-cohort-${Date.now()}`);
    const response = createResponse();
    await marketsHandler({ query: {} }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.mode, "cohort_exposure");
    assert.equal(response.body.markets[0].conditionId, "condition-1");
    assert.equal(response.body.markets[0].exposureRank.cohortWalletCount, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
    else delete process.env.DATABASE_URL;
    delete process.env.POLYMARKET_COHORT_EXPOSURE_LIMIT;
    delete process.env.POLYMARKET_COHORT_MARKET_LIMIT;
  }
});

test("markets handler serves last-good cache without refreshing when refresh is absent", async () => {
  process.env.DATA_SOURCE = "polymarket";
  const originalFetch = globalThis.fetch;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  let fetchCalls = 0;
  globalThis.fetch = async (url) => {
    fetchCalls += 1;
    throw new Error(`Unexpected refresh for ${url}`);
  };

  try {
    const { clearCache, setCachedValue } = await import("../src/cache.js");
    const { resetAppContextForTests } = await import("../src/appContext.js");
    clearCache();
    setCachedValue("smart-money-last-good", "polymarket", {
      dataSource: "polymarket",
      effectiveDataSource: "polymarket",
      registryRefreshedAt: "2026-05-13T00:00:00.000Z",
      markets: [{ conditionId: "last-good-market", outcomes: [] }],
    }, 24 * 60 * 60 * 1000);
    resetAppContextForTests();
    const { default: handler } = await import(`../api/smart-money/markets.js?case=last-good-no-refresh-${Date.now()}`);
    const response = createResponse();
    await handler({ query: {} }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.markets[0].conditionId, "last-good-market");
    assert.equal(response.body.cache.status, "last-good");
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
    else delete process.env.DATABASE_URL;
  }
});

test("markets handler does not use mock fallback for Preference outages", async () => {
  process.env.DATA_SOURCE = "preference";
  process.env.PREFERENCE_MCP_URL = "https://example.test/mcp";
  process.env.PREFERENCE_MCP_TOKEN = "test";

  const originalFetch = globalThis.fetch;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                code: "DAILY_QUOTA_EXCEEDED",
                message: "quota exhausted",
              }),
            },
          ],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  try {
    const { clearCache } = await import("../src/cache.js");
    const { resetAppContextForTests } = await import("../src/appContext.js");
    clearCache();
    resetAppContextForTests();
    const { default: handler } = await import(`../api/smart-money/markets.js?case=preference-${Date.now()}`);
    const response = createResponse();
    await handler({ query: { refresh: "1" } }, response);

    assert.equal(response.statusCode, 503);
    assert.equal(response.body.dataSource, "preference");
    assert.equal(response.body.effectiveDataSource, "none");
    assert.deepEqual(response.body.markets, []);
    assert.equal(response.body.upstreamStatus.status, "unavailable");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
    else delete process.env.DATABASE_URL;
  }
});

function jsonResponse(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function createResponse() {
  return {
    statusCode: null,
    headers: null,
    body: null,
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers;
    },
    end(value) {
      this.body = JSON.parse(value);
    },
  };
}
