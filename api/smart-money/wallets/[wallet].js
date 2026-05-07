import { sendJson, SHORT_CACHE_HEADERS } from "../../../src/http.js";
import { buildWalletDetail, readDefaultMarketSnapshot } from "../../../src/services/internalSurfaces.js";

export default async function handler(request, response) {
  try {
    const snapshot = await readDefaultMarketSnapshot();
    const wallet = buildWalletDetail(snapshot.markets, request.query.wallet);
    if (!wallet) {
      return sendJson(
        response,
        {
          snapshotAvailable: snapshot.snapshotAvailable,
          refreshedAt: snapshot.refreshedAt,
          cachedAt: snapshot.cachedAt,
          wallet: null,
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
        wallet,
      },
      200,
      SHORT_CACHE_HEADERS,
    );
  } catch (error) {
    console.error(error);
    return sendJson(response, { error: "Failed to build wallet detail" }, 500);
  }
}
