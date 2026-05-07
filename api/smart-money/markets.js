import { getAppContext } from "../../src/appContext.js";
import { getCachedValue, setCachedValue } from "../../src/cache.js";
import { sendJson, SHORT_CACHE_HEADERS } from "../../src/http.js";

const MARKETS_CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_NAMESPACE = "smart-money-markets";

export default async function handler(request, response) {
  const cacheKey = "default";
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
    const { scanner, fallbackScanner, dataSource } = getAppContext();
    const result = await scanner.scanDefaultMarkets();
    if (dataSource === "preference" && result.markets.length === 0) {
      const fallback = await fallbackScanner.scanDefaultMarkets();
      const payload = {
        dataSource,
        effectiveDataSource: "mock",
        upstreamStatus: {
          status: "fallback",
          reason: "Preference returned no markets. This often happens when MCP quota is exhausted.",
        },
        ...fallback,
      };
      return sendCachedPayload(response, cacheKey, payload);
    }
    return sendCachedPayload(response, cacheKey, {
      dataSource,
      effectiveDataSource: dataSource,
      upstreamStatus: { status: "ok", reason: null },
      ...result,
    });
  } catch (error) {
    console.error(error);
    try {
      const { fallbackScanner, dataSource } = getAppContext();
      const fallback = await fallbackScanner.scanDefaultMarkets();
      const payload = {
        dataSource,
        effectiveDataSource: "mock",
        upstreamStatus: {
          status: "fallback",
          reason: error?.message ?? "Preference scan failed.",
        },
        ...fallback,
      };
      return sendCachedPayload(response, cacheKey, payload);
    } catch (fallbackError) {
      console.error(fallbackError);
      return sendJson(response, { error: "Failed to scan markets" }, 500);
    }
  }
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
