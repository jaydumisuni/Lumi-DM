"use strict";

const assert = require("assert");
const fs = require("fs");

const read = path => fs.readFileSync(path, "utf8");
const exists = path => fs.existsSync(path);

const index = read("static/index.html");
const finish = read("static/lumi-owner-finish.js");
const runtime = read("static/lumi-runtime-controls.js");
const preload = read("electron/preload-main.js");
const widgetPreload = read("electron/preload-widget.js");
const widgetIdentity = read("electron/widget-identity-preload.js");
const main = read("electron/main.js");
const openPolicy = read("electron/release-gate-contract.js");
const extensionSource = read("electron/browser-extension-source.js");
const manifest = JSON.parse(read("browser-extension/manifest.json"));
const extensionEngine = read("browser-extension/browser-bridge.js");
const extensionSecurity = read("browser-extension/security-shim.js");
const extensionPopup = read("browser-extension/popup.html");
const mediaBridge = read("browser-extension/media-quality-bridge.js");
const mediaPicker = read("browser-extension/media-quality-picker.js");
const confirm = read("electron/confirm.html");
const widget = read("electron/widget-approved.html");
const updater = read("electron/update-manager.js");
const speed = read("core/v6/speedtest_api.py");
const localExtension = read("core/v4/local_extension.py");
const browserApi = read("core/v5/browser_api.py");
const build = JSON.parse(read("techguy-build.json"));
const iconGenerator = read("scripts/generate_lumi_icon_family.py");
const iconWorkflow = read(".github/workflows/regenerate-lumi-icons.yml");
const packagedBuild = read("scripts/build_packaged_windows_proof.ps1");
const packagedTest = read("tests/packaged_windows_lifecycle_integration.mjs");
const chromiumTest = read("tests/chromium_extension_integration.mjs");
const downloadTest = read("tests/test_release_gate_download.py");
const restartTest = read("tests/test_settings_restart.py");

const findings = [
  ["approved renderer remains frozen", () => {
    assert(!index.includes("lumi-runtime-controls.js"));
    assert(!index.includes("lumi-owner-finish.js"));
    assert(preload.includes("data-lumi-owner-finish"));
    assert(preload.includes("data-lumi-owner-runtime"));
    assert(preload.includes('inject("lumi-owner-finish.js"'));
    assert(preload.includes('inject("lumi-runtime-controls.js"'));
  }],
  ["live speed is task speed, not adapter traffic", () => {
    assert(runtime.includes("speed_bytes_per_sec"));
    assert(!runtime.includes("rx_bps"));
    assert(runtime.includes("No active downloads"));
  }],
  ["explicit speed test is truthful", () => {
    assert(speed.includes("https://speed.cloudflare.com/__down"));
    assert(speed.includes('"state": "failed"'));
    assert(speed.includes("return jsonify(failed), 503"));
  }],
  ["resolving is presented as downloading", () => {
    assert(finish.includes("normalizeVisibleStatus"));
    assert(finish.includes('task.status = "downloading"'));
    assert(widget.includes('["running","downloading","resolving","verifying","post_processing","pausing"]'));
  }],
  ["same-PC extension authentication is automatic", () => {
    assert(extensionSecurity.includes("lumiEnsureSamePcToken"));
    assert(localExtension.includes("same_pc"));
    assert(localExtension.includes("browser-extension-auto-v5"));
    assert(extensionPopup.includes("No pairing code required"));
    assert(!extensionPopup.includes("Pairing code"));
  }],
  ["one mature extension is the production source", () => {
    assert.strictEqual(manifest.version, "5.1.0");
    assert.deepStrictEqual(manifest.content_scripts[0].js, [
      "content-core.js", "media-quality-picker.js", "content-safety.js",
    ]);
    assert(extensionSource.includes('path.resolve(__dirname, "..", "browser-extension")'));
    assert(openPolicy.includes("resolveCanonicalExtension"));
    assert(openPolicy.includes("copyCanonicalExtension"));
    assert(!exists("static/browser-extension/chromium"));
    assert(extensionEngine.includes("chrome.downloads.onCreated"));
    assert(extensionEngine.includes("monitorHandoff"));
    assert(extensionEngine.includes("repairMatches"));
  }],
  ["extension handoff requires persisted Lumi ownership", () => {
    assert(mediaBridge.includes("Lumi did not persist the media handoff"));
    assert(browserApi.includes("browser_pending"));
    assert(chromiumTest.includes("browser copy was not cancelled after Lumi confirmation"));
    assert(chromiumTest.includes("browser download did not resume after Lumi failure"));
  }],
  ["media picker lists exact quality size audio and subtitles", () => {
    for (const marker of [
      "Video + audio",
      "Higher video qualities — Lumi merges audio",
      "Audio only",
      "Subtitles",
      "Size unknown",
      "bestvideo+bestaudio/best",
    ]) assert(mediaPicker.includes(marker), marker);
    assert(mediaPicker.includes("format.filesize"));
    assert(mediaPicker.includes("format.dynamic_range"));
    assert(mediaPicker.includes("format.vcodec"));
    assert(mediaPicker.includes("format.acodec"));
    assert(mediaBridge.includes("format_id"));
    assert(browserApi.includes('"subtitle_languages"'));
    assert(browserApi.includes('"video_only"'));
    assert(chromiumTest.includes('"137+bestaudio/best"'));
  }],
  ["duplicate choice appears only after collision", () => {
    assert(!confirm.includes('name="duplicate_policy"'));
    assert(confirm.includes("DUPLICATE_FILE|"));
    assert(finish.includes("showDuplicateChoice"));
    assert(browserApi.includes("if destination.exists() and not policy"));
    assert(browserApi.includes('duplicate_policy="rename"'));
  }],
  ["direct video links use Lumi media engine", () => {
    assert(finish.includes('api("/api/downloads/video"'));
    assert(finish.includes("youtube\\.com"));
    assert(finish.includes("bestvideo+bestaudio/best"));
  }],
  ["widget close and cancel controls exist", () => {
    assert(widget.includes('id="close-widget"'));
    assert(widget.includes('id="primary-cancel"'));
    assert(widget.includes('bridge.action("cancel"'));
  }],
  ["packaged widget uses the canonical Lumi identity", () => {
    assert(widgetPreload.includes('require("./widget-identity-preload")'));
    assert(widgetIdentity.includes('path.join(process.resourcesPath || "", "static", "favicon-256.png")'));
    assert(widgetIdentity.includes("pathToFileURL(icon).href"));
  }],
  ["main download list supports selection and deletion", () => {
    assert(runtime.includes("data-runtime-select"));
    assert(runtime.includes("delete_file"));
    assert(runtime.includes("Remove from Lumi and keep downloaded files"));
  }],
  ["responsive corrections preserve the frozen renderer", () => {
    assert(runtime.includes("lumi-owner-responsive-runtime"));
    assert(runtime.includes("@media(max-width:1200px){.overview-grid"));
    assert(runtime.includes("@media(max-width:850px){.app-frame"));
  }],
  ["desktop settings validate before startup mutation", () => {
    const validateAt = main.indexOf("const validated = validateDesktopDirectories(desktop)");
    const startupAt = main.indexOf("setStartupEnabled(Boolean(requestedStartup))", validateAt);
    const writeAt = main.indexOf("writeDesktopPrefs(validated)", validateAt);
    assert(validateAt >= 0);
    assert(startupAt > validateAt);
    assert(writeAt > startupAt);
  }],
  ["downloaded files are revealed, never executed", () => {
    assert(openPolicy.includes("shell.showItemInFolder(target)"));
    assert(openPolicy.includes("if (isFile)"));
    assert(openPolicy.includes("BLOCKED_EXTENSIONS"));
    assert(openPolicy.includes('".command"'));
    assert(openPolicy.includes('".py"'));
  }],
  ["tests release runtime resources cleanly", () => {
    assert(downloadTest.includes('if name == "server" or name.startswith("core.")'));
    assert(restartTest.includes('if name == "server" or name.startswith("core.")'));
    assert(downloadTest.includes("if ratio >= 0.9"));
    assert(downloadTest.includes("assert ratio < 0.9"));
  }],
  ["updates use the tools site and immutable release assets", () => {
    assert(updater.includes('const TOOLS_PAGE = "https://tools.thetechguyds.com/"'));
    assert(updater.includes("api.github.com/repos/jaydumisuni/Lumi-DM/releases/latest"));
    assert(updater.includes("SHA-256"));
  }],
  ["one approved resource feeds every Lumi icon", () => {
    assert.strictEqual(build.logo, "Resouces/download manager logo.png");
    assert.strictEqual(build.iconSource, "Resouces/download manager logo.png");
    assert.strictEqual(build.icons.source, "Resouces/download manager logo.png");
    assert(iconGenerator.includes('SOURCE = ROOT / "Resouces" / "download manager logo.png"'));
    assert(iconWorkflow.includes("Resouces/download manager logo.png"));
    assert(iconWorkflow.includes("Extension and application identity"));
    assert(exists("Resouces/download manager logo.png"));
    assert(!exists("Resouces/my_logo.png"));
  }],
  ["actual packaged app is a required release proof", () => {
    assert(packagedBuild.includes("LUMIDM-server.exe"));
    assert(packagedBuild.includes("electron-builder --win --x64 --dir"));
    assert(packagedBuild.includes("app.asar"));
    assert(packagedTest.includes("electronApp.isPackaged"));
    assert(packagedTest.includes("packaged sidecar"));
    assert(packagedTest.includes("prepared extension differs from the exact packaged extension"));
  }],
];

for (const [name, check] of findings) {
  check();
  console.log(`SRG OWNER PASS — ${name}`);
}
console.log(`Sergeant owner findings: ${findings.length}/${findings.length} PASS`);
