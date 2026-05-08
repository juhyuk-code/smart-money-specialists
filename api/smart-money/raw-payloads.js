import { getAppContext } from "../../src/appContext.js";
import { sendJson } from "../../src/http.js";

export default async function handler(request, response) {
  try {
    const { intelligenceService, dataSource } = getAppContext();
    if (typeof intelligenceService?.readRawPayloadAudit !== "function") {
      return sendJson(response, { error: "Current data source does not expose raw payload audit", dataSource }, 400);
    }
    const limit = Math.max(1, Math.min(200, Number(request.query?.limit ?? 50)));
    return sendJson(response, {
      dataSource,
      payloads: await intelligenceService.readRawPayloadAudit({ limit }),
    });
  } catch (error) {
    console.error(error);
    return sendJson(response, { error: "Failed to read raw Polymarket payload audit" }, 500);
  }
}
