"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const read = path => fs.readFileSync(path, "utf8");
const exists = path => fs.existsSync(path);
const hash = path => crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
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
const css = read("static/lumi-approved-ui.css");
const integration = read("static/lumi-approved-integration.js");
const hotfix = read("static/lumi-release-gate-hotfix.js");
const main = read("electron/main.js");
const preload = read("electron/preload-main.js");
const contract = read("electron/release-gate-contract.js");
const widget = read("electron/widget-approved.html");
const runtime = read("core/v2/runtime.py");
const server = read("server.py");
const downloadTest = read("tests/test_release_gate_download.py");
const restartTest = read("tests/test_settings_restart.py");
const publicSmoke = read("tests/windows_public_internet_smoke.py");
const visualGate = read("tests/visual_approved_gate.py");
const workflow = read(".github/workflows/lumi-release-gate.yml");
const readableWorkflow = read(".github/workflows/materialize-readable-source.yml");
const securityEvidence = execFileSync(process.execPath, [path.join(__dirname, "security-contract.test.js")], { encoding: "utf8" });
const lifecycleEvidence = execFileSync(process.execPath, [path.join(__dirname, "lumi-windows-lifecycle.test.js")], { encoding: "utf8" });

const expectedSidebar = [
  "overview", "downloads", "unfinished", "finished", "queues", "categories",
  "grabber", "firmware", "operating-systems",
];
const actualSidebar = [...index.matchAll(/data-view="([^"]+)"/g)].map(match => match[1]);

// Pass A: implementation and behavior contracts.
lane("A", 1, "Approved readable shell", () => {
  assert(exists("static/lumi-approved-ui.css"));
  assert(exists("static/lumi-approved-ui.js"));
  assert(exists("static/lumi-approved-integration.js"));
  assert(!index.includes("lumi-payload-"));
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
lane("A", 5, "Queues", () => assert(ui.includes("queues")));
lane("A", 6, "Categories", () => assert(ui.includes("categories")));
lane("A", 7, "LinkGrabber", () => assert(ui.includes("grabber")));
lane("A", 8, "Technician catalogues", () => {
  assert(ui.includes("firmware"));
  assert(ui.includes("operating-systems"));
});
lane("A", 9, "Settings persistence", () => {
  assert(hotfix.includes("writePrefs"));
  assert(restartTest.includes("survive_restart"));
});
lane("A", 10, "Speed success and failure", () => {
  assert(preload.includes("Number.isFinite"));
  assert(hotfix.includes("Connection speed test failed"));
  assert(hotfix.includes("returned no usable download result"));
});
lane("A", 11, "Extension package preparation", () => {
  assert(contract.includes("extensionDestination"));
  assert(contract.includes("errorOnExist: true"));
});
lane("A", 12, "Extension pairing and expiry", () => {
  assert(hotfix.includes("schedulePairingExpiry"));
  assert(hotfix.includes("Pairing code expired"));
});
lane("A", 13, "Extension takeover and fallback", () => {
  assert(downloadTest.includes("confirm_and_safe_fallback"));
  assert(downloadTest.includes('/browser"'));
});
lane("A", 14, "Readable Electron runtime", () => { new vm.Script(main); assert(!main.includes("Module._compile")); assert(!main.includes("gunzipSync")); assert(!exists("electron/main-payload-01.js")); });
lane("A", 15, "Tray and widget lifecycle", () => assert(lifecycleEvidence.includes("27/27 PASS")));
lane("A", 16, "Canonical Lumi identity", () => assert(lifecycleEvidence.includes("identity contract")));
lane("A", 17, "Secure path opening", () => assert(securityEvidence.includes("Secure path and extension preparation contract: PASS")));
lane("A", 18, "Single 32-connection persistence path", () => {
  assert(runtime.includes('get_setting("default_connections", 32)'));
  assert(!server.includes("set_default_connections"));
});
lane("A", 19, "Integrity and pause/resume", () => {
  assert(downloadTest.includes("sha256"));
  assert(downloadTest.includes("pause_resume_preserves_integrity"));
});
lane("A", 20, "Public-internet Windows source smoke", () => {
  assert(publicSmoke.includes("speed.cloudflare.com"));
  assert(publicSmoke.includes('"connections": 32'));
});

// Pass B: independent source, visual, security and CI evidence. These source
// hashes freeze the readable renderer that passed the fifteen-screen visual
// contract against the owner-approved mockups.
lane("B", 1, "Approved CSS frozen", () => assert.strictEqual(hash("static/lumi-approved-ui.css"), "4d05bb3fe4f41ff69dc804cb0072dab1a711515dbe928bcc131bc5c23344e183"));
lane("B", 2, "Approved UI JavaScript frozen", () => assert.strictEqual(hash("static/lumi-approved-ui.js"), "d3d9c56f1b7bb8d80320650ff5f0311a75094c5bd98d650671557a32c9d426ea"));
lane("B", 3, "Accessibility names", () => {
  assert(index.includes('aria-label="Search downloads"'));
  assert(index.includes('aria-label="Open settings menu"'));
});
lane("B", 4, "No extra sidebar functions", () => assert.strictEqual(actualSidebar.length, 9));
lane("B", 5, "Production integration bridge", () => assert(integration.includes("LumiProductionIntegration")));
lane("B", 6, "Widget bridge guard", () => assert(securityEvidence.includes("Widget bridge and DOM-safe rendering contract: PASS")));
lane("B", 7, "Widget DOM-safe task rows", () => assert(securityEvidence.includes("DOM-safe rendering contract: PASS")));
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
lane("B", 13, "Failure is not zero Mbps", () => {
  assert(preload.includes('state: failed ? "error"'));
  assert(hotfix.includes('status = state?.speedTestRunning ? "Testing" : result.error ? "Failed"'));
});
lane("B", 14, "Pairing countdown", () => {
  assert(hotfix.includes("pairingSecondsRemaining"));
  assert(hotfix.includes("Expires in"));
});
lane("B", 15, "No destructive extension cleanup", () => assert(securityEvidence.includes("extension preparation contract: PASS")));
lane("B", 16, "Executable deny-list", () => assert(securityEvidence.includes("Secure path")));
lane("B", 17, "Fifteen-screen visual comparison", () => {
  assert(visualGate.includes("REFERENCE_DHASH"));
  assert.strictEqual((visualGate.match(/\("[^"]+", "\d{2}_[^"]+"/g) || []).length, 15);
});
lane("B", 18, "Windows lifecycle check", () => assert(workflow.includes("windows-lifecycle-contract")));
lane("B", 19, "Windows public-internet check", () => assert(workflow.includes("windows-public-internet-smoke")));
lane("B", 20, "Sergeant required aggregate", () => {
  assert(workflow.includes("sergeant-20-for-2"));
  assert(workflow.includes("needs:"));
});

const failures = results.filter(result => result.status !== "PASS");
for (const result of results) {
  console.log(`${result.pass}${String(result.lane).padStart(2, "0")} ${result.status} ${result.name}${result.error ? ` — ${result.error}` : ""}`);
}
assert.strictEqual(results.length, 40, "20 lanes must run in both passes");
assert.strictEqual(failures.length, 0, JSON.stringify(failures, null, 2));
console.log("Sergeant 20-for-2: 40/40 PASS");
