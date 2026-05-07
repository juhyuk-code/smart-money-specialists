import { sendJson, SHORT_CACHE_HEADERS } from "../../../src/http.js";
import { buildMarketDetail, readDefaultMarketSnapshot } from "../../../src/services/internalSurfaces.js";

export default async function handler(request, response) {
  try {
    const snapshot = await readDefaultMarketSnapshot();
    const market = buildMarketDetail(snapshot.markets, request.query.conditionId);
    if (!market) {
      return sendJson(
        response,
        {
          snapshotAvailable: snapshot.snapshotAvailable,
          refreshedAt: snapshot.refreshedAt,
          cachedAt: snapshot.cachedAt,
          market: null,
        },
        200,
        SHORT_CACHE_HEADERS,
      );
    }

    return sendJson(
      response,
      {
        snapshotAvailable: snapshot.snapshotAvailable,
        refreshedAt: snapshot.refreshedAt,
        cachedAt: snapshot.cachedAt,
        market,
      },
      200,
      SHORT_CACHE_HEADERS,
    );
  } catch (error) {
    console.error(error);
    return sendJson(response, { error: "Failed to build market detail" }, 500);
  }
}
