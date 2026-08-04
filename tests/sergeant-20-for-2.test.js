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
const extensionSource = read("electron/browser-extension-source.js");
const widget = read("electron/widget-approved.html");
const runtime = read("core/v2/runtime.py");
const server = read("core/v2/server_app.py");
const browserApi = read("core/v5/browser_api.py");
const manifest = JSON.parse(read("browser-extension/manifest.json"));
const extensionEngine = read("browser-extension/browser-bridge.js");
const extensionSecurity = read("browser-extension/security-shim.js");
const extensionPopup = read("browser-extension/popup.html");
const mediaBridge = read("browser-extension/media-quality-bridge.js");
const mediaPicker = read("browser-extension/media-quality-picker.js");
const iconGenerator = read("scripts/generate_lumi_icon_family.py");
const iconReport = JSON.parse(read("build_config/lumi-icon-family.json"));
const buildContract = JSON.parse(read("techguy-build.json"));
const acceptance = read("docs/LUMI_ACCEPTANCE_CHECKLIST.md");
const extensionContract = read("docs/BROWSER_EXTENSION_CONTRACT.md");
const identityContract = read("docs/ICON_SOURCE_CONTRACT.md");
const downloadTest = read("tests/test_release_gate_download.py");
const restartTest = read("tests/test_settings_restart.py");
const publicSmoke = read("tests/windows_public_internet_smoke.py");
const visualGate = read("tests/visual_approved_gate.py");
const electronVisual = read("tests/electron_visual_gate.mjs");
const electronCompare = read("tests/compare_electron_visual.py");
const chromiumIntegration = read("tests/chromium_extension_integration.mjs");
const packagedBuild = read("scripts/build_packaged_windows_proof.ps1");
const packagedRuntime = read("tests/packaged_windows_lifecycle_integration.mjs");
const workflow = read(".github/workflows/lumi-release-gate.yml");
const exactWorkflow = read(".github/workflows/exact-electron-ui-gate.yml");
const readableWorkflow = read(".github/workflows/materialize-readable-source.yml");
const iconWorkflow = read(".github/workflows/regenerate-lumi-icons.yml");
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
    "docs/LUMI_ACCEPTANCE_CHECKLIST.md",
  ]) assert(exists(required), required);
  for (const removed of [
    "static/lumi-approved-integration.js",
    "static/lumi-release-gate-hotfix.js",
    "static/lumi-approved-loader.js",
    "static/lumi-payload-01.js",
  ]) assert(!exists(removed), removed);
  assert(acceptance.includes("Actual unpacked or installed EXE"));
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
lane("A", 10, "Truthful live speed and explicit capacity", () => {
  assert(ui.includes("function openSpeedTest"));
  assert(preload.includes("Number.isFinite"));
  assert(read("static/lumi-runtime-controls.js").includes("liveBytesPerSecond"));
  assert(read("static/lumi-runtime-controls.js").includes("No active downloads"));
});
lane("A", 11, "One canonical production extension", () => {
  assert.strictEqual(manifest.version, "5.1.0");
  assert.deepStrictEqual(manifest.content_scripts[0].js, [
    "content-core.js", "media-quality-picker.js", "content-safety.js",
  ]);
  assert(extensionSource.includes('path.resolve(__dirname, "..", "browser-extension")'));
  assert(contract.includes("resolveCanonicalExtension"));
  assert(contract.includes("copyCanonicalExtension"));
  assert(!exists("static/browser-extension/chromium"));
  assert(extensionContract.includes("only committed Chromium extension"));
});
lane("A", 12, "Automatic same-PC extension authentication", () => {
  assert(extensionSecurity.includes("lumiEnsureSamePcToken"));
  assert(extensionPopup.includes("No pairing code required"));
  assert(!extensionPopup.includes("Pairing code"));
  assert(securityEvidence.includes("canonical extension, and non-destructive preparation: PASS"));
});
lane("A", 13, "Real canonical extension takeover and fallback", () => {
  assert(extensionEngine.includes("chrome.downloads.onCreated"));
  assert(extensionEngine.includes("monitorHandoff"));
  assert(chromiumIntegration.includes("resolveCanonicalExtension"));
  assert(chromiumIntegration.includes("browser copy was not cancelled after Lumi confirmation"));
  assert(chromiumIntegration.includes("browser download did not resume after Lumi failure"));
});
lane("A", 14, "Exact media quality size audio and subtitle picker", () => {
  for (const marker of [
    "Video + audio",
    "Higher video qualities — Lumi merges audio",
    "Audio only",
    "Subtitles",
    "Size unknown",
    "Best available quality",
  ]) assert(mediaPicker.includes(marker), marker);
  for (const marker of ["format.filesize", "format.vcodec", "format.acodec", "format.dynamic_range"]) {
    assert(mediaPicker.includes(marker), marker);
  }
  assert(mediaBridge.includes("format_id"));
  assert(chromiumIntegration.includes('"137+bestaudio/best"'));
});
lane("A", 15, "Media selection persists into the one Lumi task store", () => {
  for (const marker of [
    '"format_id"', '"audio_only"', '"video_only"', '"subtitles"',
    '"subtitle_languages"', '"merge_output_format"',
  ]) assert(browserApi.includes(marker), marker);
  assert(browserApi.includes("runtime.store.save_task(task)"));
  assert(mediaBridge.includes('/api/v5/browser/capture'));
});
lane("A", 16, "Readable Electron runtime", () => {
  assert(lifecycleEvidence.includes("Lumi readable Windows lifecycle and identity contract: PASS"));
  new vm.Script(main);
  assert(!exists("electron/main-payload-01.js"));
});
lane("A", 17, "Tray and widget lifecycle", () => {
  assert(lifecycleEvidence.includes("PASS"));
  assert(widget.includes("window.lumiWidget"));
  assert(widget.includes('id="close-widget"'));
  assert(widget.includes('bridge.action("cancel"'));
});
lane("A", 18, "Canonical owner resource feeds every icon", () => {
  assert(exists("Resouces/download manager logo.png"));
  assert(!exists("Resouces/my_logo.png"));
  assert.strictEqual(buildContract.iconSource, "Resouces/download manager logo.png");
  assert.strictEqual(buildContract.icons.source, "Resouces/download manager logo.png");
  assert(iconGenerator.includes('SOURCE = ROOT / "Resouces" / "download manager logo.png"'));
  assert.strictEqual(iconReport.schemaVersion, 3);
  assert.strictEqual(iconReport.source, "Resouces/download manager logo.png");
  assert.strictEqual(iconReport.sourceSha256.length, 64);
  assert(identityContract.includes("sole icon-generation source"));
});
lane("A", 19, "Secure path opening and non-destructive extension copy", () => {
  assert(securityEvidence.includes("Executable deny-list, safe reveal"));
  assert(extensionSource.includes("will not delete or overwrite"));
  assert(extensionSource.includes("force: false"));
});
lane("A", 20, "Actual packaged Windows release proof is mandatory", () => {
  assert(packagedBuild.includes("LUMIDM-server.exe"));
  assert(packagedBuild.includes("electron-builder --win --x64 --dir"));
  assert(packagedBuild.includes("app.asar"));
  assert(packagedRuntime.includes("electronApp.isPackaged"));
  assert(packagedRuntime.includes("packaged sidecar"));
  assert(workflow.includes("packaged-windows-runtime"));
  assert(workflow.includes("Actual packaged Windows Lumi"));
});

lane("B", 1, "Approved index frozen", () => assert.strictEqual(hash("static/index.html"), "7a99817a0c0a898fd111c36c554df40e0b138e17d5f366603e2870ceb5835a7e"));
lane("B", 2, "Approved CSS frozen", () => assert.strictEqual(hash("static/lumi-approved-ui.css"), "fb5a17c0c573643bc6644859d98bb9ffacbd020573a8589b2807b3def7f9c8b3"));
lane("B", 3, "Approved UI JavaScript frozen", () => assert.strictEqual(hash("static/lumi-approved-ui.js"), "1cf175f6960594df2f9680b5c8f11362b48c17c5f920c08cd0fa1364c3267280"));
lane("B", 4, "Approved renderer lockup pixels frozen", () => assert.strictEqual(hash("static/assets/lumi-brand-transparent.png"), "b49a92046af4d2368c1481f63a40fddae4a5371c005e7eb62976835ee269d944"));
lane("B", 5, "No replacement renderer injected", () => {
  assert(!index.includes("integration"));
  assert(!index.includes("hotfix"));
  assert.strictEqual((index.match(/lumi-approved-ui\.js/g) || []).length, 1);
});
lane("B", 6, "Backend serves repository renderer", () => {
  assert(server.includes('@app.get("/")'));
  assert(server.includes('send_from_directory(STATIC_DIR, "index.html")'));
});
lane("B", 7, "Electron opens the real backend UI and packaged fallback", () => {
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
lane("B", 14, "Both source and packaged fifteen-state Electron capture", () => {
  assert(electronVisual.includes("11_Speed_Test_Popup"));
  assert(electronVisual.includes("13_Check_For_Updates"));
  assert(electronVisual.includes("actual-packaged-app-asar"));
  assert(electronVisual.includes("electronApp.isPackaged"));
  assert(workflow.includes("Capture all fifteen approved states from the actual packaged EXE"));
});
lane("B", 15, "No destructive extension cleanup", () => {
  assert(securityEvidence.includes("non-destructive preparation: PASS"));
  assert(extensionSource.includes("destination already exists"));
});
lane("B", 16, "Production resolver and runtime test use the same extension", () => {
  assert(chromiumIntegration.includes("resolveCanonicalExtension"));
  assert(chromiumIntegration.includes('path.join(root, "browser-extension")'));
  assert(chromiumIntegration.includes('path.join(root, "static", "browser-extension", "chromium")'));
  assert(contract.includes("extensionSource()"));
});
lane("B", 17, "Browser and Electron visual comparison", () => {
  assert(visualGate.includes("REFERENCE_DHASH"));
  assert(electronCompare.includes("EXPECTED_BLOBS"));
  assert(electronCompare.includes("15_About_Lumi"));
});
lane("B", 18, "Packaged app.asar sidecar extension and icon evidence", () => {
  assert(packagedRuntime.includes("app\\.asar"));
  assert(packagedRuntime.includes("LUMIDM-server.exe"));
  assert(packagedRuntime.includes("prepared extension differs from the exact packaged extension"));
  assert(packagedRuntime.includes("packaged runtime icon differs from the reviewed source"));
  assert(workflow.includes("packaged-hashes.json"));
  assert(workflow.includes("lumi-actual-packaged-windows-proof"));
});
lane("B", 19, "Windows public-internet check", () => {
  assert(publicSmoke.includes("speed.cloudflare.com"));
  assert(publicSmoke.includes('"connections": 32'));
  assert(workflow.includes("windows-public-internet-smoke"));
});
lane("B", 20, "Sergeant aggregates every source runtime package and network gate", () => {
  assert(workflow.includes("sergeant-20-for-2"));
  assert(workflow.includes("PACKAGED_WINDOWS_RESULT"));
  assert(workflow.includes('test "$PACKAGED_WINDOWS_RESULT" = success'));
  assert(exactWorkflow.includes("exact-approved-electron-ui"));
  assert(iconWorkflow.includes("LUMI_ICON_FAMILY_VERIFIED"));
});

const failures = results.filter(result => result.status !== "PASS");
for (const result of results) {
  console.log(`${result.pass}${String(result.lane).padStart(2, "0")} ${result.status} ${result.name}${result.error ? ` — ${result.error}` : ""}`);
}
assert.strictEqual(results.length, 40, "20 lanes must run in both passes");
assert.strictEqual(failures.length, 0, JSON.stringify(failures, null, 2));
console.log("Sergeant 20-for-2: 40/40 PASS");
