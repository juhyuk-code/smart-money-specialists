import { MockPreferenceApi } from "./data/mockPreferenceApi.js";
import { createPreferenceMcpApiFromEnv } from "./data/preferenceMcpApi.js";
import { MarketScanner } from "./services/marketScanner.js";
import { RegistryStore } from "./services/registryStore.js";

let context;

export function getAppContext() {
  if (!context) {
    const dataSource = getDataSource();
    const api = createDataApi();
    const registryStore = new RegistryStore(api);
    const scanner = new MarketScanner(api, registryStore);
    context = { api, registryStore, scanner, dataSource };
  }
  return context;
}

export function createDataApi() {
  const source = getDataSource();
  if (source === "mock") return new MockPreferenceApi();
  if (source === "preference") return createPreferenceMcpApiFromEnv();
  throw new Error(`Unsupported DATA_SOURCE "${source}". Use "mock" or "preference".`);
}

export function getDataSource() {
  return process.env.DATA_SOURCE ?? "mock";
}

export function getRuntimeDebugInfo() {
  return {
    dataSource: getDataSource(),
    hasPreferenceMcpUrl: Boolean(process.env.PREFERENCE_MCP_URL),
    hasPreferenceMcpToken: Boolean(process.env.PREFERENCE_MCP_TOKEN),
    nodeEnv: process.env.NODE_ENV ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    vercelGitCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  };
}
