import { getAppContext } from "../../../src/appContext.js";
import { sendJson, SHORT_CACHE_HEADERS } from "../../../src/http.js";

export default async function handler(request, response) {
  try {
    const conditionId = decodeURIComponent(request.query.conditionId);
    const { scanner } = getAppContext();
    const scan = await scanner.scanConditionId(conditionId);
    if (!scan) return sendJson(response, { error: "Market not found" }, 404);
    return sendJson(response, scan, 200, SHORT_CACHE_HEADERS);
  } catch (error) {
    console.error(error);
    return sendJson(response, { error: "Failed to scan market" }, 500);
  }
}
