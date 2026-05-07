import { getAppContext } from "../../src/appContext.js";
import { getCachedValue, setCachedValue } from "../../src/cache.js";
import { sendJson, SHORT_CACHE_HEADERS } from "../../src/http.js";

const MARKETS_CACHE_TTL_MS = 5 * 60 * 1000;
const LAST_GOOD_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_NAMESPACE = "smart-money-markets";
const LAST_GOOD_NAMESPACE = "smart-money-last-good";

export default async function handler(request, response) {
  const { dataSource } = getAppContext();
  const cacheKey = dataSource;
  const cached = getCachedValue(CACHE_NAMESPACE, cacheKey);
  if (cached && request.query?.refresh !== "1") {
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

  try {
    const { scanner } = getAppContext();
    const result = await scanner.scanDefaultMarkets();
    if (dataSource === "preference" && result.markets.length === 0) {
      return sendLastKnownOrUnavailable(response, "Preference returned no markets. This often happens when MCP quota is exhausted.");
    }
    const payload = {
      dataSource,
      effectiveDataSource: dataSource,
      upstreamStatus: { status: "ok", reason: null },
      ...result,
    };
    if (dataSource === "preference") setCachedValue(LAST_GOOD_NAMESPACE, "preference", payload, LAST_GOOD_TTL_MS);
    return sendCachedPayload(response, cacheKey, payload);
  } catch (error) {
    console.error(error);
    if (dataSource === "preference") return sendLastKnownOrUnavailable(response, error?.message ?? "Preference scan failed.");
    return sendJson(response, { error: "Failed to scan markets" }, 500);
  }
}

function sendLastKnownOrUnavailable(response, reason) {
  const lastGood = getCachedValue(LAST_GOOD_NAMESPACE, "preference");
  if (lastGood) {
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
          status: "last-good",
          cachedAt: lastGood.cachedAt,
        },
      },
      200,
      SHORT_CACHE_HEADERS,
    );
  }

  return sendJson(
    response,
    {
      dataSource: "preference",
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
