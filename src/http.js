export function sendJson(response, data, status = 200, headers = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(data, null, 2));
}

export function sendText(response, data, status = 200, headers = {}) {
  response.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
  });
  response.end(data);
}

export async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  if (typeof request.body === "string" && request.body.length > 0) return JSON.parse(request.body);

  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function requireMethod(request, response, method) {
  if (request.method === method) return true;
  response.writeHead(405, {
    allow: method,
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify({ error: `Method ${request.method} not allowed` }));
  return false;
}

export function requireJobSecret(request, response) {
  const expected = process.env.JOB_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  if (!expected && !cronSecret) return true;
  const provided = readHeader(request, "x-job-secret") ?? request.query?.secret;
  if (expected && provided === expected) return true;
  const bearer = bearerToken(readHeader(request, "authorization"));
  if (cronSecret && bearer === cronSecret) return true;
  response.writeHead(401, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify({ error: "Unauthorized" }));
  return false;
}

export function requireAgentDataToken(request, response) {
  const expected = process.env.AGENT_DATA_TOKEN;
  if (!expected) {
    response.writeHead(503, {
      "content-type": "application/json; charset=utf-8",
    });
    response.end(JSON.stringify({ error: "AGENT_DATA_TOKEN is not configured" }));
    return false;
  }

  const bearer = bearerToken(readHeader(request, "authorization"));
  const provided = bearer ?? readHeader(request, "x-agent-data-token") ?? request.query?.token;
  if (provided === expected) return true;
  response.writeHead(401, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify({ error: "Unauthorized" }));
  return false;
}

function readHeader(request, name) {
  const headers = request?.headers;
  if (!headers) return null;
  if (typeof headers.get === "function") return headers.get(name) ?? headers.get(name.toLowerCase()) ?? headers.get(name.toUpperCase());
  return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()] ?? null;
}

function bearerToken(authorization) {
  if (typeof authorization !== "string" || !authorization.toLowerCase().startsWith("bearer ")) return null;
  return authorization.slice("bearer ".length).trim();
}

export const SHORT_CACHE_HEADERS = {
  "cache-control": "s-maxage=90, stale-while-revalidate=60",
};

export const SHARE_CACHE_HEADERS = {
  "cache-control": "public, max-age=300, s-maxage=300",
};
