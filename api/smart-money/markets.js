import { getAppContext } from "../../src/appContext.js";
import { sendJson, SHORT_CACHE_HEADERS } from "../../src/http.js";

export default async function handler(request, response) {
  try {
    const { scanner, fallbackScanner, dataSource } = getAppContext();
    const result = await scanner.scanDefaultMarkets();
    if (dataSource === "preference" && result.markets.length === 0) {
      const fallback = await fallbackScanner.scanDefaultMarkets();
      return sendJson(
        response,
        {
          dataSource,
          effectiveDataSource: "mock",
          upstreamStatus: {
            status: "fallback",
            reason: "Preference returned no markets. This often happens when MCP quota is exhausted.",
          },
          ...fallback,
        },
        200,
        SHORT_CACHE_HEADERS,
      );
    }
    return sendJson(response, { dataSource, ...result }, 200, SHORT_CACHE_HEADERS);
  } catch (error) {
    console.error(error);
    try {
      const { fallbackScanner, dataSource } = getAppContext();
      const fallback = await fallbackScanner.scanDefaultMarkets();
      return sendJson(
        response,
        {
          dataSource,
          effectiveDataSource: "mock",
          upstreamStatus: {
            status: "fallback",
            reason: error?.message ?? "Preference scan failed.",
          },
          ...fallback,
        },
        200,
        SHORT_CACHE_HEADERS,
      );
    } catch (fallbackError) {
      console.error(fallbackError);
      return sendJson(response, { error: "Failed to scan markets" }, 500);
    }
  }
}
