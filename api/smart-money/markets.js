import { getAppContext } from "../../src/appContext.js";
import { getCachedValue, setCachedValue } from "../../src/cache.js";
import { sendJson, SHORT_CACHE_HEADERS } from "../../src/http.js";
import { readMarketSnapshot, saveMarketSnapshot } from "../../src/services/snapshotStore.js";

const MARKETS_CACHE_TTL_MS = 2 * 60 * 1000;
const LAST_GOOD_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_NAMESPACE = "smart-money-markets";
const LAST_GOOD_NAMESPACE = "smart-money-last-good";

export default async function handler(request, response) {
  const { dataSource } = getAppContext();
  const cacheKey = dataSource;
  const refreshRequested = request.query?.refresh === "1";
  const cached = getCachedValue(CACHE_NAMESPACE, cacheKey);
  if (cached && !refreshRequested) {
    return sendJson(
      response,
      {
        ...cached.value,
        cache: {
          status: "hit",
          cachedAt: cached.cachedAt,
        },
      },
      200,
      SHORT_CACHE_HEADERS,
    );
  }

  if (!refreshRequested && dataSource !== "mock") {
    const stalePayload = await readLastKnown(dataSource);
    if (stalePayload) {
      return sendLastGood(response, stalePayload.entry, `${dataSource} refresh was not requested.`, stalePayload.status);
    }
  }

  try {
    const { scanner } = getAppContext();
    const result = await scanner.scanDefaultMarkets({ refresh: refreshRequested });
    if (dataSource !== "mock" && result.markets.length === 0) {
      return sendLastKnownOrUnavailable(response, dataSource, `${dataSource} returned no markets.`);
    }
    const payload = {
      dataSource,
      effectiveDataSource: dataSource,
      upstreamStatus: { status: "ok", reason: null },
      ...result,
    };
    if (dataSource !== "mock") await saveLastGoodSnapshot(dataSource, payload);
    return sendCachedPayload(response, cacheKey, payload);
  } catch (error) {
    console.error(error);
    if (dataSource !== "mock") return sendLastKnownOrUnavailable(response, dataSource, error?.message ?? `${dataSource} scan failed.`);
    return sendJson(response, { error: "Failed to scan markets" }, 500);
  }
}

async function sendLastKnownOrUnavailable(response, dataSource, reason) {
  const lastKnown = await readLastKnown(dataSource);
  if (lastKnown) {
    return sendLastGood(response, lastKnown.entry, reason, lastKnown.status);
  }

  return sendJson(
    response,
    {
      dataSource,
      effectiveDataSource: "none",
      upstreamStatus: {
        status: "unavailable",
        reason,
      },
      registryRefreshedAt: null,
      markets: [],
      cache: {
        status: "empty",
      },
    },
    503,
    { "cache-control": "no-store" },
  );
}

async function readLastKnown(dataSource) {
  const lastGood = getCachedValue(LAST_GOOD_NAMESPACE, dataSource);
  if (lastGood) return { entry: lastGood, status: "last-good" };

  try {
    const storedLastGood = await readMarketSnapshot(`default:${dataSource}`);
    if (Array.isArray(storedLastGood?.value?.markets)) {
      setCachedValue(LAST_GOOD_NAMESPACE, dataSource, storedLastGood.value, LAST_GOOD_TTL_MS);
      return { entry: storedLastGood, status: "stored-last-good" };
    }
    if (storedLastGood) {
      console.warn("Stored smart-money market snapshot is missing a markets array");
    }
  } catch (error) {
    console.warn("Failed to read stored smart-money market snapshot", error?.message ?? String(error));
  }

  return null;
}

async function saveLastGoodSnapshot(dataSource, payload) {
  setCachedValue(LAST_GOOD_NAMESPACE, dataSource, payload, LAST_GOOD_TTL_MS);
  try {
    await saveMarketSnapshot(`default:${dataSource}`, payload);
  } catch (error) {
    console.warn("Failed to save smart-money market snapshot", error?.message ?? String(error));
  }
}

function sendLastGood(response, lastGood, reason, status) {
  return sendJson(
    response,
    {
      ...lastGood.value,
      upstreamStatus: {
        status: "stale",
        reason,
        lastGoodAt: lastGood.cachedAt,
      },
      cache: {
        status,
        cachedAt: lastGood.cachedAt,
      },
    },
    200,
    SHORT_CACHE_HEADERS,
  );
}

function sendCachedPayload(response, cacheKey, payload) {
  setCachedValue(CACHE_NAMESPACE, cacheKey, payload, MARKETS_CACHE_TTL_MS);
  return sendJson(
    response,
    {
      ...payload,
      cache: {
        status: "miss",
        ttlSeconds: MARKETS_CACHE_TTL_MS / 1000,
      },
    },
    200,
    SHORT_CACHE_HEADERS,
  );
}
