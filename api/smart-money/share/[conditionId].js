import { getAppContext } from "../../../src/appContext.js";
import { sendJson, SHARE_CACHE_HEADERS } from "../../../src/http.js";
import { renderShareSvg } from "../../../src/services/shareRenderer.js";

export default async function handler(request, response) {
  try {
    const conditionId = decodeURIComponent(request.query.conditionId).replace(/\.png$/i, "");
    const selectedOutcome = request.query.outcome ?? null;
    const { scanner } = getAppContext();
    const scan = await scanner.scanConditionId(conditionId);
    if (!scan) return sendJson(response, { error: "Market not found" }, 404);

    response.writeHead(200, {
      "content-type": "image/svg+xml; charset=utf-8",
      ...SHARE_CACHE_HEADERS,
    });
    return response.end(renderShareSvg(scan, selectedOutcome));
  } catch (error) {
    console.error(error);
    return sendJson(response, { error: "Failed to render share image" }, 500);
  }
}
