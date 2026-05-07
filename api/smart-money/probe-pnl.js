import { getAppContext } from "../../src/appContext.js";
import { sendJson } from "../../src/http.js";

export default async function handler(request, response) {
  try {
    const wallet = request.query.wallet;
    if (!wallet) return sendJson(response, { error: "Missing wallet query param" }, 400);

    const { api, dataSource } = getAppContext();
    if (typeof api.probeRealizedPnl !== "function") {
      return sendJson(response, { error: "Current data source does not support PnL probing", dataSource }, 400);
    }

    return sendJson(response, {
      dataSource,
      wallet: `${wallet.slice(0, 6)}...${wallet.slice(-4)}`,
      probe: await api.probeRealizedPnl(wallet),
    });
  } catch (error) {
    console.error(error);
    return sendJson(response, { error: "Failed to probe realized PnL", message: error?.message ?? String(error) }, 500);
  }
}
