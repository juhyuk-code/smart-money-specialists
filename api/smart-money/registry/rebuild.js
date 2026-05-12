import { getAppContext } from "../../../src/appContext.js";
import { requireJobSecret, sendJson } from "../../../src/http.js";

export default async function handler(request, response) {
  if (!requireJobSecret(request, response)) return;
  try {
    const { registryStore } = getAppContext();
    return sendJson(response, await registryStore.rebuild());
  } catch (error) {
    console.error(error);
    return sendJson(response, { error: "Failed to rebuild registry" }, 500);
  }
}
