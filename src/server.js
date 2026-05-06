import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { getAppContext } from "./appContext.js";
import { readJsonBody, sendJson, sendText } from "./http.js";
import { renderShareSvg } from "./services/shareRenderer.js";

const rootDir = join(fileURLToPath(import.meta.url), "../..");
const publicDir = join(rootDir, "public");
const { registryStore, scanner } = getAppContext();

await registryStore.ensureReady();

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname === "/api/smart-money/registry") {
      return sendJson(response, await registryStore.ensureReady());
    }

    if (url.pathname === "/api/smart-money/registry/rebuild" && request.method === "POST") {
      return sendJson(response, await registryStore.rebuild());
    }

    if (url.pathname === "/api/smart-money/markets") {
      return sendJson(response, await scanner.scanDefaultMarkets());
    }

    if (url.pathname.startsWith("/api/smart-money/markets/")) {
      const conditionId = decodeURIComponent(url.pathname.split("/").at(-1));
      const scan = await scanner.scanConditionId(conditionId);
      if (!scan) return sendJson(response, { error: "Market not found" }, 404);
      return sendJson(response, scan);
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
  console.log(`Smart Money Specialists running at http://localhost:${port}`);
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

function contentType(filePath) {
  return {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
  }[extname(filePath)] ?? "application/octet-stream";
}
