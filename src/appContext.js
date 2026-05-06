import { MockPreferenceApi } from "./data/mockPreferenceApi.js";
import { createPreferenceMcpApiFromEnv } from "./data/preferenceMcpApi.js";
import { MarketScanner } from "./services/marketScanner.js";
import { RegistryStore } from "./services/registryStore.js";

let context;

export function getAppContext() {
  if (!context) {
    const api = createDataApi();
    const registryStore = new RegistryStore(api);
    const scanner = new MarketScanner(api, registryStore);
    context = { api, registryStore, scanner };
  }
  return context;
}

export function createDataApi() {
  const source = process.env.DATA_SOURCE ?? "mock";
  if (source === "mock") return new MockPreferenceApi();
  if (source === "preference") return createPreferenceMcpApiFromEnv();
  throw new Error(`Unsupported DATA_SOURCE "${source}". Use "mock" or "preference".`);
}
