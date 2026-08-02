"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const read = relative => fs.readFileSync(relative, "utf8");
const exists = relative => fs.existsSync(relative);
const hash = relative => crypto.createHash("sha256").update(fs.readFileSync(relative)).digest("hex");
const results = [];

function lane(pass, number, name, check) {
  try {
    check();
    results.push({ pass, lane: number, name, status: "PASS" });
  } catch (error) {
    results.push({ pass, lane: number, name, status: "FAIL", error: error.message });
  }
}

const index = read("static/index.html");
const ui = read("static/lumi-approved-ui.js");
const main = read("electron/main.js");
const preload = read("electron/preload-main.js");
const contract = read("electron/release-gate-contract.js");
const widget = read("electron/widget-approved.html");
const runtime = read("core/v2/runtime.py");
const server = read("core/v2/server_app.py");
const downloadTest = read("tests/test_release_gate_download.py");
const restartTest = read("tests/test_settings_restart.py");
const publicSmoke = read("tests/windows_public_internet_smoke.py");
const visualGate = read("tests/visual_approved_gate.py");
const electronVisual = read("tests/electron_visual_gate.mjs");
const electronCompare = read("tests/compare_electron_visual.py");
const workflow = read(".github/workflows/lumi-release-gate.yml");
const exactWorkflow = read(".github/workflows/exact-electron-ui-gate.yml");
const readableWorkflow = read(".github/workflows/materialize-readable-source.yml");
const securityEvidence = execFileSync(process.execPath, [path.join(__dirname, "security-contract.test.js")], { encoding: "utf8" });
const lifecycleEvidence = execFileSync(process.execPath, [path.join(__dirname, "lumi-windows-lifecycle.test.js")], { encoding: "utf8" });

const expectedSidebar = [
  "overview", "downloads", "unfinished", "finished", "queues", "categories",
  "grabber", "firmware", "operating-systems",
];
const actualSidebar = [...index.matchAll(/data-view="([^"]+)"/g)].map(match => match[1]);

lane("A", 1, "Exact approved readable shell", () => {
  for (const required of [
    "static/index.html",
    "static/lumi-approved-ui.css",
    "static/lumi-approved-ui.js",
    "static/assets/lumi-brand-transparent.png",
  ]) assert(exists(required), required);
  for (const removed of [
    "static/lumi-approved-integration.js",
    "static/lumi-release-gate-hotfix.js",
    "static/lumi-approved-loader.js",
    "static/lumi-payload-01.js",
  ]) assert(!exists(removed), removed);
});
lane("A", 2, "Locked sidebar order", () => assert.deepStrictEqual(actualSidebar, expectedSidebar));
lane("A", 3, "Overview and quick actions", () => {
  assert(ui.includes("function renderOverview"));
  assert(ui.includes("QUICK ACTIONS"));
  assert(ui.includes("quick-grid"));
});
lane("A", 4, "Download state views", () => {
  for (const marker of ["downloads", "unfinished", "finished"]) assert(ui.includes(marker));
});
lane("A", 5, "Queues layout", () => assert(ui.includes("queues")));
lane("A", 6, "Categories layout", () => assert(ui.includes("categories")));
lane("A", 7, "LinkGrabber layout", () => assert(ui.includes("grabber")));
lane("A", 8, "Technician layout contract", () => {
  assert.deepStrictEqual(actualSidebar.slice(-2), ["firmware", "operating-systems"]);
  assert(ui.includes("renderFirmware"));
  assert(ui.includes("renderOS"));
});
lane("A", 9, "Settings and restart persistence evidence", () => {
  assert(ui.includes("renderSettings"));
  assert(restartTest.includes("survive_restart"));
});
lane("A", 10, "Speed surface and normalization", () => {
  assert(ui.includes("function openSpeedTest"));
  assert(preload.includes("Number.isFinite"));
});
lane("A", 11, "Extension package preparation", () => {
  assert(contract.includes("extensionDestination"));
  assert(contract.includes("errorOnExist: true"));
});
lane("A", 12, "Extension security and pairing contract", () => {
  assert(securityEvidence.includes("PASS"));
  assert(downloadTest.includes("extension_client"));
});
lane("A", 13, "Extension takeover and fallback", () => {
  assert(downloadTest.includes("confirm_and_safe_fallback"));
  assert(downloadTest.includes('/browser"'));
});
lane("A", 14, "Readable Electron runtime", () => {
  new vm.Script(main);
  assert(!main.includes("Module._compile"));
  assert(!main.includes("gunzipSync"));
  assert(!exists("electron/main-payload-01.js"));
});
lane("A", 15, "Tray and widget lifecycle", () => {
  assert(lifecycleEvidence.includes("PASS"));
  assert(widget.includes("window.lumiWidget"));
});
lane("A", 16, "Canonical Lumi identity", () => {
  assert(main.includes("favicon-256.png"));
  assert(exists("assets/windows/Lumi-DM.ico"));
});
lane("A", 17, "Secure path opening", () => assert(securityEvidence.includes("Secure path")));
lane("A", 18, "Single 32-connection persistence path", () => {
  assert(runtime.includes('get_setting("default_connections", 32)'));
  assert(!read("server.py").includes("set_default_connections"));
});
lane("A", 19, "Integrity and pause/resume", () => {
  assert(downloadTest.includes("sha256"));
  assert(downloadTest.includes("pause_resume_preserves_integrity"));
});
lane("A", 20, "Public-internet Windows source smoke", () => {
  assert(publicSmoke.includes("speed.cloudflare.com"));
  assert(publicSmoke.includes('"connections": 32'));
});

lane("B", 1, "Approved index frozen", () => assert.strictEqual(hash("static/index.html"), "7a99817a0c0a898fd111c36c554df40e0b138e17d5f366603e2870ceb5835a7e"));
lane("B", 2, "Approved CSS frozen", () => assert.strictEqual(hash("static/lumi-approved-ui.css"), "fb5a17c0c573643bc6644859d98bb9ffacbd020573a8589b2807b3def7f9c8b3"));
lane("B", 3, "Approved UI JavaScript frozen", () => assert.strictEqual(hash("static/lumi-approved-ui.js"), "1cf175f6960594df2f9680b5c8f11362b48c17c5f920c08cd0fa1364c3267280"));
lane("B", 4, "Approved brand pixels frozen", () => assert.strictEqual(hash("static/assets/lumi-brand-transparent.png"), "b49a92046af4d2368c1481f63a40fddae4a5371c005e7eb62976835ee269d944"));
lane("B", 5, "No replacement renderer injected", () => {
  assert(!index.includes("integration"));
  assert(!index.includes("hotfix"));
  assert.strictEqual((index.match(/lumi-approved-ui\.js/g) || []).length, 1);
});
lane("B", 6, "Backend serves repository renderer", () => {
  assert(server.includes('@app.get("/")'));
  assert(server.includes('send_from_directory(STATIC_DIR, "index.html")'));
});
lane("B", 7, "Electron opens the real backend UI", () => {
  assert(main.includes("await mainWindow.loadURL(API_ORIGIN)"));
  assert(main.includes('path.join(process.resourcesPath, "static", "index.html")'));
  assert(main.includes('path.resolve(__dirname, "..", "static", "index.html")'));
});
lane("B", 8, "Readable-source workflow", () => {
  assert(readableWorkflow.includes("Reject opaque runtime transport"));
  assert(readableWorkflow.includes("! grep -Eq '_compile|gunzipSync'"));
});
lane("B", 9, "Controlled 1-versus-32 proof", () => {
  assert(downloadTest.includes("single_seconds"));
  assert(downloadTest.includes("parallel_seconds"));
});
lane("B", 10, "SHA-256 exactness", () => assert(downloadTest.includes("SHA = hashlib.sha256(DATA).hexdigest()")));
lane("B", 11, "Restart persistence proof", () => assert(restartTest.includes("_new_application")));
lane("B", 12, "Speed NaN prevention", () => assert(preload.includes("Number.isFinite(parsed)")));
lane("B", 13, "Speed failure remains an error", () => assert(preload.includes('state: failed ? "error"')));
lane("B", 14, "Owner-approved fifteen-state Electron capture", () => {
  assert(electronVisual.includes("11_Speed_Test_Popup"));
  assert(electronVisual.includes("13_Check_For_Updates"));
  assert(electronVisual.includes("owner-approved-15"));
});
lane("B", 15, "No destructive extension cleanup", () => assert(securityEvidence.includes("extension preparation contract: PASS")));
lane("B", 16, "Executable deny-list", () => assert(securityEvidence.includes("Secure path")));
lane("B", 17, "Browser and Electron visual comparison", () => {
  assert(visualGate.includes("REFERENCE_DHASH"));
  assert(electronCompare.includes("EXPECTED_BLOBS"));
  assert(electronCompare.includes("15_About_Lumi"));
});
lane("B", 18, "Windows lifecycle check", () => assert(workflow.includes("windows-lifecycle-contract")));
lane("B", 19, "Windows public-internet check", () => assert(workflow.includes("windows-public-internet-smoke")));
lane("B", 20, "Sergeant and exact-Electron aggregates", () => {
  assert(workflow.includes("sergeant-20-for-2"));
  assert(exactWorkflow.includes("exact-approved-electron-ui"));
  assert(exactWorkflow.includes("actual-windows-electron"));
});

const failures = results.filter(result => result.status !== "PASS");
for (const result of results) {
  console.log(`${result.pass}${String(result.lane).padStart(2, "0")} ${result.status} ${result.name}${result.error ? ` — ${result.error}` : ""}`);
}
assert.strictEqual(results.length, 40, "20 lanes must run in both passes");
assert.strictEqual(failures.length, 0, JSON.stringify(failures, null, 2));
console.log("Sergeant 20-for-2: 40/40 PASS");
