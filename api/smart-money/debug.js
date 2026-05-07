import { getRuntimeDebugInfo } from "../../src/appContext.js";
import { sendJson } from "../../src/http.js";

export default async function handler(request, response) {
  return sendJson(response, getRuntimeDebugInfo());
}
