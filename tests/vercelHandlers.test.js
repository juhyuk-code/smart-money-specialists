import test from "node:test";
import assert from "node:assert/strict";

test("markets handler falls back to mock data when Preference returns no markets", async () => {
  process.env.DATA_SOURCE = "mock";
  const { default: handler } = await import(`../api/smart-money/markets.js?case=${Date.now()}`);

  const response = createResponse();
  await handler({}, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.dataSource, "mock");
  assert.ok(response.body.markets.length > 0);
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
