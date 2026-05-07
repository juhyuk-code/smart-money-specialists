import { getAppContext } from "../../src/appContext.js";
import { sendJson } from "../../src/http.js";

export default async function handler(request, response) {
  try {
    const { registryStore, dataSource } = getAppContext();
    const registry = await registryStore.ensureReady();
    return sendJson(response, {
      dataSource,
      refreshedAt: registry.refreshedAt,
      audit: registry.audit,
    });
  } catch (error) {
    console.error(error);
    return sendJson(response, { error: "Failed to load registry audit" }, 500);
  }
}
