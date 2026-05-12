import { getAppContext } from "../../../src/appContext.js";
import { setCachedValue } from "../../../src/cache.js";
import { requireJobSecret, sendJson } from "../../../src/http.js";
import { saveMarketSnapshot } from "../../../src/services/snapshotStore.js";

const MARKETS_CACHE_TTL_MS = 2 * 60 * 1000;
const LAST_GOOD_TTL_MS = 24 * 60 * 60 * 1000;
const MARKETS_CACHE_NAMESPACE = "smart-money-markets";
const LAST_GOOD_NAMESPACE = "smart-money-last-good";

export default async function handler(request, response) {
  if (!requireJobSecret(request, response)) return;
  try {
    const { scanner, dataSource } = getAppContext();
    const mode = request.query?.mode ?? request.query?.refreshMode ?? "live";
    const refreshMethod = mode === "cohort-exposure" || mode === "cohort_exposure"
      ? "refreshCohortExposureMarkets"
      : "refreshLiveMarkets";
    if (typeof scanner[refreshMethod] !== "function") {
      return sendJson(response, { error: `Current data source does not support ${mode} refresh`, dataSource, mode }, 400);
    }
    const options = {
      cohortLimit: toPositiveInteger(request.query?.cohortLimit),
      marketLimit: toPositiveInteger(request.query?.marketLimit),
      positionPageLimit: toPositiveInteger(request.query?.positionPageLimit),
    };
    const result = await scanner[refreshMethod](Object.fromEntries(Object.entries(options).filter(([, value]) => value)));
    const payload = { dataSource, effectiveDataSource: dataSource, refreshMode: mode, ...result };
    await saveMarketSnapshot(`default:${dataSource}`, payload);
    setCachedValue(MARKETS_CACHE_NAMESPACE, dataSource, payload, MARKETS_CACHE_TTL_MS);
    setCachedValue(LAST_GOOD_NAMESPACE, dataSource, payload, LAST_GOOD_TTL_MS);
    return sendJson(response, {
      dataSource,
      refreshedAt: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error(error);
    return sendJson(response, { error: "Failed to refresh live Polymarket intelligence" }, 500);
  }
}

function toPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
