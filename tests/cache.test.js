import test from "node:test";
import assert from "node:assert/strict";

import { clearCache, getCachedValue, setCachedValue } from "../src/cache.js";

test("cache returns values before TTL expiry", () => {
  clearCache();
  setCachedValue("markets", "default", { ok: true }, 60_000);
  const cached = getCachedValue("markets", "default");
  assert.deepEqual(cached.value, { ok: true });
  assert.match(cached.cachedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("cache expires values after TTL", async () => {
  clearCache();
  setCachedValue("markets", "default", { ok: true }, 1);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(getCachedValue("markets", "default"), null);
});
