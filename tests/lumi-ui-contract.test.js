"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const file = relative => path.join(root, relative);
const read = relative => fs.readFileSync(file(relative), "utf8");
const exists = relative => fs.existsSync(file(relative));
const sha256 = relative => crypto.createHash("sha256").update(fs.readFileSync(file(relative))).digest("hex");

const exactApproved = Object.freeze({
  "static/index.html": "7a99817a0c0a898fd111c36c554df40e0b138e17d5f366603e2870ceb5835a7e",
  "static/lumi-approved-ui.css": "fb5a17c0c573643bc6644859d98bb9ffacbd020573a8589b2807b3def7f9c8b3",
  "static/lumi-approved-ui.js": "1cf175f6960594df2f9680b5c8f11362b48c17c5f920c08cd0fa1364c3267280",
  "static/assets/lumi-brand-transparent.png": "b49a92046af4d2368c1481f63a40fddae4a5371c005e7eb62976835ee269d944",
});

for (const [relative, expected] of Object.entries(exactApproved)) {
  assert(exists(relative), `${relative} must exist`);
  assert.strictEqual(sha256(relative), expected, `${relative} must remain byte-for-byte owner approved`);
}

for (const removed of [
  "static/lumi-approved-brand.svg",
  "static/lumi-approved-integration.js",
  "static/lumi-release-gate-hotfix.js",
  "static/lumi-approved-loader.js",
  "static/lumi-payload-01.js",
  "electron/main-payload-01.js",
  "static/browser-extension/chromium",
]) assert(!exists(removed), `${removed} must remain removed`);

const index = read("static/index.html");
const ui = read("static/lumi-approved-ui.js");
const preload = read("electron/preload-main.js");
const contract = read("electron/release-gate-contract.js");
const extensionSource = read("electron/browser-extension-source.js");
const manifest = JSON.parse(read("browser-extension/manifest.json"));
const mediaPicker = read("browser-extension/media-quality-picker.js");
const mediaBridge = read("browser-extension/media-quality-bridge.js");
const main = read("electron/main.js");
const server = read("core/v2/server_app.py");
const runtime = read("core/v2/runtime.py");
const build = JSON.parse(read("techguy-build.json"));
const iconReport = JSON.parse(read("build_config/lumi-icon-family.json"));

assert(index.includes('href="/static/lumi-approved-ui.css"'));
assert(index.includes('src="/static/assets/lumi-brand-transparent.png"'));
assert(index.includes('src="/static/lumi-approved-ui.js"'));
assert(!index.includes("lumi-approved-integration.js"));
assert(!index.includes("lumi-release-gate-hotfix.js"));
assert(!index.includes("lumi-payload-"));
assert(ui.includes("window.LumiReplica"));
assert(ui.includes("function renderOverview"));
assert(ui.includes("function openSpeedTest"));
assert(ui.includes("function openUpdateDialog"));

assert(!main.includes("Module._compile"));
assert(!main.includes("gunzipSync"));
assert(main.includes('require("./release-gate-contract")'));
assert(main.includes('path.join(process.resourcesPath, "static", "favicon-256.png")'));
assert(main.includes("await mainWindow.loadURL(API_ORIGIN)"));
assert(server.includes('@app.get("/")'));
assert(server.includes('send_from_directory(STATIC_DIR, "index.html")'));
assert(server.includes('@app.get("/static/<path:filename>")'));
assert(runtime.includes('get_setting("default_connections", 32)'));

for (const marker of [
  "BLOCKED_EXTENSIONS",
  "secureOpenTarget",
  "The selected item is outside Lumi's approved folders",
  "Lumi does not launch executable, script, shortcut, or active-content files",
  "extensionDestination",
  "resolveCanonicalExtension",
  "copyCanonicalExtension",
]) assert(contract.includes(marker), marker);
for (const marker of [
  "errorOnExist: true",
  "force: false",
  "will not delete or overwrite",
  'path.resolve(__dirname, "..", "browser-extension")',
]) assert(extensionSource.includes(marker), marker);

assert.strictEqual(manifest.version, "5.1.0");
assert.deepStrictEqual(manifest.content_scripts[0].js, [
  "content-core.js", "media-quality-picker.js", "content-safety.js",
]);
for (const marker of ["Video + audio", "Audio only", "Subtitles", "Size unknown"]) {
  assert(mediaPicker.includes(marker), marker);
}
assert(mediaBridge.includes("format_id"));
assert.strictEqual(build.iconSource, "Resouces/download manager logo.png");
assert.strictEqual(build.icons.source, "Resouces/download manager logo.png");
assert.strictEqual(iconReport.schemaVersion, 3);
assert.strictEqual(iconReport.source, "Resouces/download manager logo.png");
assert(exists("Resouces/download manager logo.png"));
assert(!exists("Resouces/my_logo.png"));

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
  process: { defaultApp: true },
  console,
}, { filename: file("electron/preload-main.js") });
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

  invokeResult = { name: "Lumi DM", version: "1.0.0" };
  const appInfo = await exposed.getAppInfo();
  assert.strictEqual(appInfo.isPackaged, false, "development preload proof must not claim packaged execution");

  console.log("Exact approved Lumi UI, canonical extension, identity, Electron, speed and security contract: PASS");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
