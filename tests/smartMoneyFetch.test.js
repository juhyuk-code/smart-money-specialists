import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");

function loadSmartMoneyModule(fetchImpl) {
  const sourcePath = path.resolve("src/lib/smartMoney.ts");
  const source = fs.readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;

  const module = { exports: {} };
  const sandbox = {
    module,
    exports: module.exports,
    fetch: fetchImpl,
    setTimeout,
    clearTimeout,
    AbortController,
    DOMException,
    Date,
    Intl,
    console,
    window: undefined,
  };
  vm.runInNewContext(transpiled, sandbox, { filename: "smartMoney.cjs" });
  return module.exports;
}

test("fetchMarkets aborts requests that exceed the timeout budget", { timeout: 500 }, async () => {
  let requestSignal;
  const fetchImpl = (_url, init = {}) => {
    requestSignal = init.signal;
    return new Promise((_resolve, reject) => {
      requestSignal?.addEventListener("abort", () => {
        const error = new Error("The operation was aborted");
        error.name = "AbortError";
        reject(error);
      });
    });
  };

  const { fetchMarkets } = loadSmartMoneyModule(fetchImpl);

  await assert.rejects(
    () => fetchMarkets({ timeoutMs: 10 }),
    (error) => error.name === "SmartMoneyFetchError" && error.code === "timeout",
  );
  assert.equal(requestSignal.aborted, true);
});
