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
