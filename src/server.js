import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";

import { getAppContext, getRuntimeDebugInfo } from "./appContext.js";
import { readJsonBody, sendJson, sendText } from "./http.js";
import { buildFeed, buildLeaders, buildMarketDetail, buildWalletDetail, buildWalletIndex } from "./services/internalSurfaces.js";
import { renderShareSvg } from "./services/shareRenderer.js";
import { saveMarketSnapshot } from "./services/snapshotStore.js";

const rootDir = join(fileURLToPath(import.meta.url), "../..");
const { loadEnvConfig } = nextEnv;
loadEnvConfig(rootDir);

const publicDir = join(rootDir, "public");
const { registryStore, scanner, intelligenceService, dataSource } = getAppContext();

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
      };
      const result = await scanner[refreshMethod](Object.fromEntries(Object.entries(options).filter(([, value]) => value)));
      await saveMarketSnapshot(`default:${dataSource}`, { dataSource, effectiveDataSource: dataSource, refreshMode: mode, ...result });
      return sendJson(response, { dataSource, refreshedAt: new Date().toISOString(), ...result });
    }

    if (url.pathname === "/api/smart-money/markets") {
      return sendJson(response, { dataSource, ...await scanner.scanDefaultMarkets() });
    }

    if (url.pathname === "/api/smart-money/leaders") {
      const snapshot = await scanner.scanDefaultMarkets();
      return sendJson(response, { dataSource, leaders: buildLeaders(snapshot.markets) });
    }

    if (url.pathname === "/api/smart-money/wallets") {
      const snapshot = await scanner.scanDefaultMarkets();
      return sendJson(response, { dataSource, wallets: buildWalletIndex(snapshot.markets) });
    }

    if (url.pathname.startsWith("/api/smart-money/wallets/")) {
      const wallet = decodeURIComponent(url.pathname.split("/").at(-1));
      const snapshot = await scanner.scanDefaultMarkets();
      return sendJson(response, { dataSource, wallet: buildWalletDetail(snapshot.markets, wallet) });
    }

    if (url.pathname === "/api/smart-money/feed") {
      const snapshot = await scanner.scanDefaultMarkets();
      return sendJson(response, { dataSource, feed: buildFeed(snapshot.markets) });
    }

    if (url.pathname.startsWith("/api/smart-money/markets/")) {
      const conditionId = decodeURIComponent(url.pathname.split("/").at(-1));
      const snapshot = await scanner.scanDefaultMarkets();
      const scan = buildMarketDetail(snapshot.markets, conditionId) ?? await scanner.scanConditionId(conditionId);
      if (!scan) return sendJson(response, { error: "Market not found" }, 404);
      return sendJson(response, { market: scan });
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
