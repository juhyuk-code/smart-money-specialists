import { sendJson, SHORT_CACHE_HEADERS } from "../../src/http.js";
import { buildLeaders, readDefaultMarketSnapshot } from "../../src/services/internalSurfaces.js";

export default async function handler(_request, response) {
  try {
    const snapshot = await readDefaultMarketSnapshot();
    return sendJson(
      response,
      {
        snapshotAvailable: snapshot.snapshotAvailable,
        refreshedAt: snapshot.refreshedAt,
        cachedAt: snapshot.cachedAt,
        leaders: buildLeaders(snapshot.markets),
      },
      200,
      SHORT_CACHE_HEADERS,
    );
  } catch (error) {
    console.error(error);
    return sendJson(response, { error: "Failed to build leaders" }, 500);
  }
}
