import { getAppContext } from "../../../src/appContext.js";
import { requireMethod, sendJson } from "../../../src/http.js";

export default async function handler(request, response) {
  if (!requireMethod(request, response, "POST")) return;

  try {
    const { registryStore } = getAppContext();
    return sendJson(response, await registryStore.rebuild());
  } catch (error) {
    console.error(error);
    return sendJson(response, { error: "Failed to rebuild registry" }, 500);
  }
}
