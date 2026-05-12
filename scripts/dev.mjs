import { spawn } from "node:child_process";
import net from "node:net";
import { join } from "node:path";

const apiPort = String(await findOpenPort(Number(process.env.API_PORT ?? 3001)));
const nextPort = String(await findOpenPort(Number(process.env.PORT ?? 3000), new Set([Number(apiPort)])));
const apiProxyUrl = process.env.API_PROXY_URL ?? `http://localhost:${apiPort}`;
const nextBin = join("node_modules", ".bin", process.platform === "win32" ? "next.cmd" : "next");

const children = [
  spawn("node", ["src/server.js"], {
    env: { ...process.env, PORT: apiPort },
    stdio: "inherit",
  }),
  spawn(nextBin, ["dev", "-p", nextPort], {
    env: { ...process.env, PORT: nextPort, API_PROXY_URL: apiProxyUrl },
    stdio: "inherit",
  }),
];

console.log(`API proxy: http://localhost:${apiPort}`);
console.log(`Next app:  http://localhost:${nextPort}`);

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(code), 100).unref();
}

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    if (code === 0 || signal === "SIGTERM") return;
    shutdown(code ?? 1);
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

async function findOpenPort(startPort, reserved = new Set()) {
  let port = startPort;
  while (reserved.has(port) || !(await isPortOpen(port))) {
    port += 1;
  }
  return port;
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
  });
}
