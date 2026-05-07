import { getAppContext } from "../../src/appContext.js";
import { sendJson } from "../../src/http.js";

export default async function handler(request, response) {
  try {
    const { api, dataSource } = getAppContext();
    if (typeof api.probeTrendingMarkets !== "function") {
      return sendJson(response, { error: "Current data source does not support trending probing", dataSource }, 400);
    }

    return sendJson(response, {
      dataSource,
      probe: await api.probeTrendingMarkets(),
    });
  } catch (error) {
    console.error(error);
    return sendJson(response, { error: "Failed to probe trending markets", message: error?.message ?? String(error) }, 500);
  }
}
