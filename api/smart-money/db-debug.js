import { checkDatabaseLatency, getPoolDebugInfo } from "../../src/services/db.js";
import { sendJson } from "../../src/http.js";

export default async function handler(request, response) {
  const pool = getPoolDebugInfo();
  if (!pool.hasDatabaseUrl) {
    return sendJson(response, { hasDatabaseUrl: false, ok: false, pool }, 200, { "cache-control": "no-store" });
  }

  const database = await checkDatabaseLatency();
  return sendJson(
    response,
    {
      hasDatabaseUrl: true,
      ok: database.ok,
      database,
      pool: getPoolDebugInfo(),
    },
    200,
    { "cache-control": "no-store" },
  );
}
