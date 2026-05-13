import { getAppContext } from "../../../src/appContext.js";
import { sendJson, SHORT_CACHE_HEADERS } from "../../../src/http.js";
import { buildEnrichedWalletDetail, buildWalletDetail, readDefaultMarketSnapshot } from "../../../src/services/internalSurfaces.js";

export default async function handler(request, response) {
  try {
    const snapshot = await readDefaultMarketSnapshot();
    const { api, polymarketStore } = getAppContext();
    const wallet = await readWalletDetail(snapshot.markets, request.query.wallet, { api, store: polymarketStore ?? api?.store });
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

async function readWalletDetail(markets, walletId, { api, store }) {
  if (api || store) {
    try {
      return await buildEnrichedWalletDetail(markets, walletId, { api, store });
    } catch (error) {
      console.warn("Wallet enrichment failed; falling back to snapshot detail", error?.message ?? String(error));
    }
  }
  return buildWalletDetail(markets, walletId);
}
