import { MockPreferenceApi } from "./data/mockPreferenceApi.js";
import { PolymarketApi } from "./data/polymarketApi.js";
import { createPreferenceMcpApiFromEnv } from "./data/preferenceMcpApi.js";
import { MarketScanner } from "./services/marketScanner.js";
import { PolymarketIntelligenceService } from "./services/polymarketIntelligenceService.js";
import { PolymarketStore } from "./services/polymarketStore.js";
import { getPoolDebugInfo } from "./services/db.js";
import { RegistryStore } from "./services/registryStore.js";

let context;

export function getAppContext() {
  if (!context) {
    const dataSource = getDataSource();
    if (dataSource === "polymarket") {
      const polymarketStore = new PolymarketStore();
      const api = new PolymarketApi({ store: polymarketStore });
      const intelligenceService = new PolymarketIntelligenceService(api, polymarketStore);
      context = {
        api,
        registryStore: intelligenceService,
        scanner: intelligenceService,
        intelligenceService,
        polymarketStore,
        dataSource,
      };
      return context;
    }
    const api = createDataApi();
    const registryStore = new RegistryStore(api);
    const scanner = new MarketScanner(api, registryStore);
    const fallbackApi = new MockPreferenceApi();
    const fallbackRegistryStore = new RegistryStore(fallbackApi);
    const fallbackScanner = new MarketScanner(fallbackApi, fallbackRegistryStore);
    context = { api, registryStore, scanner, dataSource, fallbackApi, fallbackRegistryStore, fallbackScanner };
  }
  return context;
}

export function createDataApi() {
  const source = getDataSource();
  if (source === "mock") return new MockPreferenceApi();
  if (source === "preference") return createPreferenceMcpApiFromEnv();
  if (source === "polymarket") return new PolymarketApi({ store: new PolymarketStore() });
  throw new Error(`Unsupported DATA_SOURCE "${source}". Use "mock", "preference", or "polymarket".`);
}

export function getDataSource() {
  return process.env.DATA_SOURCE ?? "mock";
}

export function getRuntimeDebugInfo() {
  return {
    dataSource: getDataSource(),
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasPreferenceMcpUrl: Boolean(process.env.PREFERENCE_MCP_URL),
    hasPreferenceMcpToken: Boolean(process.env.PREFERENCE_MCP_TOKEN),
    nodeEnv: process.env.NODE_ENV ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    database: getPoolDebugInfo(),
  };
}

export function resetAppContextForTests() {
  context = null;
}
