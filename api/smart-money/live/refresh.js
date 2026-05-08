import { getAppContext } from "../../../src/appContext.js";
import { requireJobSecret, sendJson } from "../../../src/http.js";
import { saveMarketSnapshot } from "../../../src/services/snapshotStore.js";

export default async function handler(request, response) {
  if (!requireJobSecret(request, response)) return;
  try {
    const { scanner, dataSource } = getAppContext();
    if (typeof scanner.refreshLiveMarkets !== "function") {
      return sendJson(response, { error: "Current data source does not support live refresh", dataSource }, 400);
    }
    const result = await scanner.refreshLiveMarkets();
    await saveMarketSnapshot(`default:${dataSource}`, { dataSource, effectiveDataSource: dataSource, ...result });
    return sendJson(response, {
      dataSource,
      refreshedAt: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error(error);
    return sendJson(response, { error: "Failed to refresh live Polymarket intelligence" }, 500);
  }
}
