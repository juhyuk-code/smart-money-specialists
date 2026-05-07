import { getAppContext } from "../../src/appContext.js";
import { sendJson, SHORT_CACHE_HEADERS } from "../../src/http.js";

export default async function handler(request, response) {
  try {
    const { scanner, dataSource } = getAppContext();
    const result = await scanner.scanDefaultMarkets();
    return sendJson(response, { dataSource, ...result }, 200, SHORT_CACHE_HEADERS);
  } catch (error) {
    console.error(error);
    return sendJson(response, { error: "Failed to scan markets" }, 500);
  }
}
