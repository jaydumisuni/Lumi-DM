"use strict";

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const hotfix = fs.readFileSync("static/lumi-release-gate-hotfix.js", "utf8");
const ui = fs.readFileSync("static/lumi-approved-ui.js", "utf8");
const integration = fs.readFileSync("static/lumi-approved-integration.js", "utf8");
const preload = fs.readFileSync("electron/preload-main.js", "utf8");
const contract = fs.readFileSync("electron/release-gate-contract.js", "utf8");
const main = fs.readFileSync("electron/main.js", "utf8");
const server = fs.readFileSync("server.py", "utf8");
const runtime = fs.readFileSync("core/v2/runtime.py", "utf8");
const index = fs.readFileSync("static/index.html", "utf8");

for (const file of [
  "static/lumi-approved-ui.css",
  "static/lumi-approved-ui.js",
  "static/lumi-approved-integration.js",
]) {
  assert(fs.existsSync(file), `${file} must be readable and committed`);
}
for (const removed of [
  "static/lumi-approved-loader.js",
  "static/lumi-payload-01.js",
  "electron/main-payload-01.js",
]) {
  assert(!fs.existsSync(removed), `${removed} must remain removed`);
}

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
  "data-test-network",
  "data-start-speed-test",
  "data-export-settings",
  "data-import-settings",
  "data-reset-settings",
  "/api/v4/security/pairing",
  "/api/v4/security/clients",
  "pairingSecondsRemaining",
  "schedulePairingExpiry",
  "Mozilla Firefox\", \"Unavailable",
]) {
  assert(hotfix.includes(marker), marker);
}
for (const marker of [
  "BLOCKED_EXTENSIONS",
  "secureOpenTarget",
  "The selected file is outside Lumi's approved folders",
  "Lumi does not launch executable or script files",
  "extensionDestination",
  "errorOnExist: true",
]) {
  assert(contract.includes(marker), marker);
}
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
    send() {},
    on() {},
    removeListener() {},
  },
};
vm.runInNewContext(preload, {
  require(id) {
    assert.strictEqual(id, "electron");
    return electron;
  },
  console,
}, { filename: "electron/preload-main.js" });
assert(exposed, "preload bridge must be exposed");
assert.strictEqual(typeof exposed.prepareBrowserExtension, "function");

(async () => {
  invokeResult = {
    state: "complete",
    result: { download_mbps: 80, upload_mbps: 20, latency_ms: 12.4 },
  };
  const success = await exposed.getConnectionCapacity();
  assert.strictEqual(success.ok, true);
  assert.strictEqual(success.capacity_bytes_per_sec, 10_000_000);
  assert.strictEqual(success.upload_bytes_per_sec, 2_500_000);
  assert.strictEqual(success.capacity_bps, 80_000_000);
  assert.strictEqual(success.upload_bps, 20_000_000);
  assert.strictEqual(success.ping_ms, 12.4);

  invokeResult = { ok: false, state: "error", error: "timeout" };
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
})().catch(error => {
  console.error(error);
  process.exit(1);
});
