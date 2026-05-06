import { getAppContext } from "../../src/appContext.js";
import { readJsonBody, requireMethod, sendJson, SHORT_CACHE_HEADERS } from "../../src/http.js";

export default async function handler(request, response) {
  if (!requireMethod(request, response, "POST")) return;

  try {
    const body = await readJsonBody(request);
    const { scanner } = getAppContext();
    const result = await scanner.customScan(body.url ?? "");
    return sendJson(response, result, result.status === "ready" ? 200 : 400, SHORT_CACHE_HEADERS);
  } catch (error) {
    console.error(error);
    return sendJson(response, { error: "Failed to run custom scan" }, 500);
  }
}
