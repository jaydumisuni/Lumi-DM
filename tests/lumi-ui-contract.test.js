"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const exists = file => fs.existsSync(path.join(root, file));
const hotfix = read("static/lumi-release-gate-hotfix.js");
const ui = read("static/lumi-approved-ui.js");
const integration = read("static/lumi-approved-integration.js");
const preload = read("electron/preload-main.js");
const contract = read("electron/release-gate-contract.js");
const main = read("electron/main.js");
const server = read("server.py");
const runtime = read("core/v2/runtime.py");
const index = read("static/index.html");

for (const file of [
  "static/lumi-approved-ui.css",
  "static/lumi-approved-ui.js",
  "static/lumi-approved-integration.js",
]) assert(exists(file), `${file} must be readable and committed`);
for (const removed of [
  "static/lumi-approved-loader.js",
  "static/lumi-payload-01.js",
  "electron/main-payload-01.js",
]) assert(!exists(removed), `${removed} must remain removed`);

assert(index.includes('aria-label="Search downloads"'));
assert(index.includes('aria-label="Open settings menu"'));
assert(index.includes('src="lumi-approved-ui.js"'));
assert(index.includes('src="lumi-approved-integration.js"'));
assert(!index.includes("lumi-payload-"));
assert(!main.includes("_compile"));
assert(!main.includes("gunzipSync"));
assert(main.includes('require("./release-gate-contract")'));
assert(!server.includes("set_default_connections"));
assert(runtime.includes('get_setting("default_connections", 32)'));

for (const marker of [
  "data-test-network", "data-start-speed-test", "data-export-settings",
  "data-import-settings", "data-reset-settings", "/api/v4/security/pairing",
  "/api/v4/security/clients", "pairingSecondsRemaining", "schedulePairingExpiry",
]) assert(hotfix.includes(marker), marker);
assert(hotfix.includes("Mozilla Firefox"));
assert(hotfix.includes("Unavailable"));
for (const marker of [
  "BLOCKED_EXTENSIONS", "secureOpenTarget", "The selected item is outside Lumi's approved folders",
  "Lumi does not launch executable, script, shortcut, or active-content files",
  "extensionDestination", "errorOnExist: true",
]) assert(contract.includes(marker), marker);
assert(ui.includes("window.LumiReplica"));
assert(integration.includes("window.LumiProductionIntegration"));

let exposed = null;
let invokeResult = null;
const electron = {
  contextBridge: {
    exposeInMainWorld(name, value) {
      assert.strictEqual(name, "electronApp");
      exposed = value;
    },
  },
  ipcRenderer: {
    invoke: async () => invokeResult,
    send() {}, on() {}, removeListener() {},
  },
};
vm.runInNewContext(preload, {
  require(id) { assert.strictEqual(id, "electron"); return electron; },
  console,
}, { filename: path.join(root, "electron", "preload-main.js") });
assert(exposed, "preload bridge must be exposed");
assert.strictEqual(typeof exposed.prepareBrowserExtension, "function");

(async () => {
  invokeResult = { state: "complete", result: { download_mbps: 80, upload_mbps: 20, latency_ms: 12.4 } };
  const success = await exposed.getConnectionCapacity();
  assert.strictEqual(success.ok, true);
  assert.strictEqual(success.capacity_bytes_per_sec, 10_000_000);
  assert.strictEqual(success.upload_bytes_per_sec, 2_500_000);
  assert.strictEqual(success.capacity_bps, 80_000_000);
  assert.strictEqual(success.upload_bps, 20_000_000);
  assert.strictEqual(success.ping_ms, 12.4);

  invokeResult = { state: "complete", result: { capacity_bytes_per_sec: null, capacity_bps: 80_000_000 } };
  const bitRateFallback = await exposed.getConnectionCapacity();
  assert.strictEqual(bitRateFallback.capacity_bytes_per_sec, 10_000_000);
  assert.strictEqual(bitRateFallback.capacity_bps, 80_000_000);

  invokeResult = { state: "complete", result: { download_bytes_per_sec: 2_000_000, download_bps: 1 } };
  const byteRatePrecedence = await exposed.getConnectionCapacity();
  assert.strictEqual(byteRatePrecedence.capacity_bytes_per_sec, 2_000_000);

  invokeResult = { ok: false, state: "error", error: "timeout", result: { download_mbps: 80 } };
  const failure = await exposed.runConnectionCapacityTest();
  assert.strictEqual(failure.ok, false);
  assert.strictEqual(failure.state, "error");
  assert.strictEqual(failure.error, "timeout");
  assert.strictEqual(failure.capacity_bytes_per_sec, 0);
  assert.strictEqual(failure.capacity_bps, 0);

  invokeResult = { state: "complete", result: { download_mbps: "unknown" } };
  const invalid = await exposed.getConnectionCapacity();
  assert.strictEqual(Number.isNaN(invalid.capacity_bps), false);
  assert.strictEqual(invalid.capacity_bps, 0);

  console.log("Lumi readable UI, settings, speed and extension contract: PASS");
})().catch(error => { console.error(error); process.exit(1); });
