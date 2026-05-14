import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

import { getAppContext, getRuntimeDebugInfo } from "./appContext.js";
import { getCachedValue, setCachedValue } from "./cache.js";
import { readJsonBody, sendJson, sendText } from "./http.js";
import { buildEnrichedWalletDetail, buildFeed, buildLeaders, buildMarketDetail, buildWalletDetail, buildWalletIndex } from "./services/internalSurfaces.js";
import { renderShareSvg } from "./services/shareRenderer.js";
import { readMarketSnapshot, saveMarketSnapshot } from "./services/snapshotStore.js";

const rootDir = join(fileURLToPath(import.meta.url), "../..");
const { loadEnvConfig } = nextEnv;
loadEnvConfig(rootDir);

const publicDir = join(rootDir, "public");
const { api, registryStore, scanner, intelligenceService, polymarketStore, dataSource } = getAppContext();
const MARKETS_CACHE_TTL_MS = 2 * 60 * 1000;
const LAST_GOOD_TTL_MS = 24 * 60 * 60 * 1000;
const MARKETS_CACHE_NAMESPACE = "smart-money-markets";
const LAST_GOOD_NAMESPACE = "smart-money-last-good";

void registryStore.ensureReady().catch((error) => {
  console.warn("Smart-money registry warmup failed", error?.code ?? "", error?.message ?? String(error));
});

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/smart-money/registry") {
      return sendJson(response, await registryStore.ensureReady());
    }

    if (url.pathname === "/api/smart-money/audit") {
      const registry = await registryStore.ensureReady();
      return sendJson(response, { dataSource, refreshedAt: registry.refreshedAt, audit: registry.audit });
    }

    if (url.pathname === "/api/smart-money/debug") {
      return sendJson(response, getRuntimeDebugInfo());
    }

    if (url.pathname === "/api/smart-money/raw-payloads") {
      const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit") ?? 50)));
      return sendJson(response, {
        dataSource,
        payloads: await intelligenceService?.readRawPayloadAudit?.({ limit }) ?? [],
      });
    }

    if (url.pathname === "/api/smart-money/registry/rebuild" && ["GET", "POST"].includes(request.method)) {
      return sendJson(response, await registryStore.rebuild());
    }

    if (url.pathname === "/api/smart-money/live/refresh" && ["GET", "POST"].includes(request.method)) {
      const mode = url.searchParams.get("mode") ?? url.searchParams.get("refreshMode") ?? "live";
      const refreshMethod = mode === "cohort-exposure" || mode === "cohort_exposure"
        ? "refreshCohortExposureMarkets"
        : "refreshLiveMarkets";
      if (typeof scanner[refreshMethod] !== "function") {
        return sendJson(response, { error: `Current data source does not support ${mode} refresh`, dataSource, mode }, 400);
      }
      const options = {
        cohortLimit: toPositiveInteger(url.searchParams.get("cohortLimit")),
        marketLimit: toPositiveInteger(url.searchParams.get("marketLimit")),
        positionPageLimit: toPositiveInteger(url.searchParams.get("positionPageLimit")),
        persistStoreWrites: parseBoolean(url.searchParams.get("persistStoreWrites"), false),
      };
      const result = await scanner[refreshMethod](Object.fromEntries(Object.entries(options).filter(([, value]) => value)));
      const payload = { dataSource, effectiveDataSource: dataSource, refreshMode: mode, ...result };
      await saveDefaultMarketSnapshot(payload);
      return sendJson(response, { dataSource, refreshedAt: new Date().toISOString(), ...result });
    }

    if (url.pathname === "/api/smart-money/markets") {
      return sendJson(response, await readDefaultMarketsPayload({ refresh: url.searchParams.get("refresh") === "1" }));
    }

    if (url.pathname === "/api/smart-money/leaders") {
      const snapshot = await readDefaultMarketsPayload({ refresh: url.searchParams.get("refresh") === "1" });
      return sendJson(response, { dataSource, leaders: buildLeaders(snapshot.markets), cache: snapshot.cache });
    }

    if (url.pathname === "/api/smart-money/wallets") {
      const snapshot = await readDefaultMarketsPayload({ refresh: url.searchParams.get("refresh") === "1" });
      return sendJson(response, { dataSource, wallets: buildWalletIndex(snapshot.markets), cache: snapshot.cache });
    }

    if (url.pathname.startsWith("/api/smart-money/wallets/")) {
      const wallet = decodeURIComponent(url.pathname.split("/").at(-1));
      const snapshot = await readDefaultMarketsPayload({ refresh: url.searchParams.get("refresh") === "1" });
      return sendJson(response, {
        dataSource,
        wallet: await readWalletDetail(snapshot.markets, wallet, { api, store: polymarketStore ?? api?.store }),
        cache: snapshot.cache,
      });
    }

    if (url.pathname === "/api/smart-money/feed") {
      const snapshot = await readDefaultMarketsPayload({ refresh: url.searchParams.get("refresh") === "1" });
      return sendJson(response, { dataSource, feed: buildFeed(snapshot.markets), cache: snapshot.cache });
    }

    if (url.pathname.startsWith("/api/smart-money/markets/")) {
      const conditionId = decodeURIComponent(url.pathname.split("/").at(-1));
      const refresh = url.searchParams.get("refresh") === "1";
      const snapshot = await readDefaultMarketsPayload({ refresh });
      const scan = buildMarketDetail(snapshot.markets, conditionId) ?? (refresh ? await scanner.scanConditionId(conditionId) : null);
      if (!scan) return sendJson(response, { error: "Market not found", cache: snapshot.cache }, 404);
      return sendJson(response, { market: scan, cache: snapshot.cache });
    }

    if (url.pathname === "/api/smart-money/custom-scan" && request.method === "POST") {
      const body = await readJsonBody(request);
      const result = await scanner.customScan(body.url ?? "");
      return sendJson(response, result, result.status === "ready" ? 200 : 400);
    }

    if (url.pathname.startsWith("/api/smart-money/share/")) {
      const conditionId = decodeURIComponent(url.pathname.split("/").at(-1).replace(/\.png$/i, ""));
      const scan = await scanner.scanConditionId(conditionId);
      if (!scan) return sendJson(response, { error: "Market not found" }, 404);
      const svg = renderShareSvg(scan, url.searchParams.get("outcome"));
      response.writeHead(200, {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "public, max-age=300",
      });
      return response.end(svg);
    }

    return serveStatic(url.pathname, response);
  } catch (error) {
    console.error(error);
    return sendJson(response, { error: "Internal server error" }, 500);
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`pref running at http://localhost:${port}`);
});

async function readDefaultMarketsPayload({ refresh = false } = {}) {
  if (!refresh) {
    const cached = getCachedValue(MARKETS_CACHE_NAMESPACE, dataSource);
    if (cached) {
      return {
        ...cached.value,
        cache: { status: "hit", cachedAt: cached.cachedAt },
      };
    }

    const lastKnown = await readLastKnownDefaultSnapshot();
    if (lastKnown) return withStaleMetadata(lastKnown.entry, lastKnown.status, `${dataSource} refresh was not requested.`);
  }

  try {
    const result = await scanner.scanDefaultMarkets({ refresh });
    if (dataSource !== "mock" && result.markets.length === 0) {
      const lastKnown = await readLastKnownDefaultSnapshot();
      if (lastKnown) return withStaleMetadata(lastKnown.entry, lastKnown.status, `${dataSource} returned no markets.`);
      return unavailableMarketsPayload(`${dataSource} returned no markets.`);
    }

    const payload = {
      dataSource,
      effectiveDataSource: dataSource,
      upstreamStatus: { status: "ok", reason: null },
      ...result,
    };
    if (dataSource !== "mock") await saveDefaultMarketSnapshot(payload);
    else setCachedValue(MARKETS_CACHE_NAMESPACE, dataSource, payload, MARKETS_CACHE_TTL_MS);
    return {
      ...payload,
      cache: { status: refresh ? "refresh" : "miss", ttlSeconds: MARKETS_CACHE_TTL_MS / 1000 },
    };
  } catch (error) {
    if (dataSource === "mock") throw error;
    const reason = error?.message ?? `${dataSource} scan failed.`;
    const lastKnown = await readLastKnownDefaultSnapshot();
    if (lastKnown) return withStaleMetadata(lastKnown.entry, lastKnown.status, reason);
    return unavailableMarketsPayload(reason);
  }
}

async function readLastKnownDefaultSnapshot() {
  const lastGood = getCachedValue(LAST_GOOD_NAMESPACE, dataSource);
  if (lastGood) return { entry: lastGood, status: "last-good" };

  const stored = await readStoredDefaultSnapshot();
  if (stored) {
    setCachedValue(LAST_GOOD_NAMESPACE, dataSource, stored.value, LAST_GOOD_TTL_MS);
    return { entry: stored, status: "stored-last-good" };
  }

  return null;
}

async function readStoredDefaultSnapshot() {
  try {
    const stored = await readMarketSnapshot(`default:${dataSource}`);
    if (Array.isArray(stored?.value?.markets)) return stored;
  } catch (error) {
    console.warn("Failed to read stored smart-money market snapshot", error?.message ?? String(error));
  }
  return null;
}

async function saveDefaultMarketSnapshot(payload) {
  setCachedValue(MARKETS_CACHE_NAMESPACE, dataSource, payload, MARKETS_CACHE_TTL_MS);
  setCachedValue(LAST_GOOD_NAMESPACE, dataSource, payload, LAST_GOOD_TTL_MS);
  try {
    await saveMarketSnapshot(`default:${dataSource}`, payload);
  } catch (error) {
    console.warn("Failed to save smart-money market snapshot", error?.message ?? String(error));
  }
}

function withStaleMetadata(entry, cacheStatus, reason) {
  return {
    ...entry.value,
    upstreamStatus: {
      status: "stale",
      reason,
      lastGoodAt: entry.cachedAt,
    },
    cache: {
      status: cacheStatus,
      cachedAt: entry.cachedAt,
    },
  };
}

function unavailableMarketsPayload(reason) {
  return {
    dataSource,
    effectiveDataSource: "none",
    upstreamStatus: {
      status: "unavailable",
      reason,
    },
    registryRefreshedAt: null,
    markets: [],
    cache: {
      status: "empty",
    },
  };
}

async function serveStatic(pathname, response) {
  const requestPath = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) return sendText(response, "Not found", 404);
  try {
    const file = await readFile(filePath);
    response.writeHead(200, { "content-type": contentType(filePath) });
    response.end(file);
  } catch {
    sendText(response, "Not found", 404);
  }
}

async function readWalletDetail(markets, walletId, { api, store }) {
  if (api || store) {
    try {
      return await buildEnrichedWalletDetail(markets, walletId, { api, store });
    } catch (error) {
      console.warn("Wallet enrichment failed; falling back to snapshot detail", error?.message ?? String(error));
    }
  }
  return buildWalletDetail(markets, walletId);
}

function toPositiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function contentType(filePath) {
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
  }[extname(filePath)] ?? "application/octet-stream";
}
