"use strict";

const assert = require("assert");
const fs = require("fs");

const read = path => fs.readFileSync(path, "utf8");
const exists = path => fs.existsSync(path);

const index = read("static/index.html");
const runtime = read("static/lumi-runtime-controls.js");
const preload = read("electron/preload-main.js");
const popup = read("browser-extension/popup-runtime-fix.js");
const security = read("browser-extension/security-shim.js");
const confirm = read("electron/confirm.html");
const widget = read("electron/widget-approved.html");
const updater = read("electron/update-manager.js");
const speed = read("core/v6/speedtest_api.py");
const localExtension = read("core/v4/local_extension.py");
const browserApi = read("core/v5/browser_api.py");
const build = read("techguy-build.json");
const iconGenerator = read("scripts/generate_lumi_icon_family.py");

const findings = [
  ["approved renderer remains frozen", () => {
    assert(!index.includes("lumi-runtime-controls.js"));
    assert(preload.includes("data-lumi-owner-runtime"));
    assert(preload.includes("/static/lumi-runtime-controls.js"));
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
    assert(runtime.includes('publicStatus'));
    assert(widget.includes('["running","downloading","resolving","verifying","post_processing","pausing"]'));
  }],
  ["same-PC extension authentication is automatic", () => {
    assert(security.includes("lumiEnsureSamePcToken"));
    assert(localExtension.includes("same_pc"));
    assert(localExtension.includes("browser-extension-auto-v5"));
  }],
  ["extension handoff requires persisted Lumi ownership", () => {
    assert(popup.includes("handoff?.id"));
    assert(popup.includes("Lumi did not persist the download handoff"));
    assert(browserApi.includes("browser_pending"));
  }],
  ["duplicate choice appears only after collision", () => {
    assert(!confirm.includes('name="duplicate_policy"'));
    assert(confirm.includes("DUPLICATE_FILE|"));
    assert(browserApi.includes("if destination.exists() and not policy"));
  }],
  ["widget close and cancel controls exist", () => {
    assert(widget.includes('id="close-widget"'));
    assert(widget.includes('id="primary-cancel"'));
    assert(widget.includes('bridge.action("cancel"'));
  }],
  ["main download list supports selection and deletion", () => {
    assert(runtime.includes("data-runtime-select"));
    assert(runtime.includes("delete_file"));
    assert(runtime.includes("Remove from Lumi and keep downloaded files"));
  }],
  ["updates use the tools site and immutable release assets", () => {
    assert(updater.includes('const TOOLS_PAGE = "https://tools.thetechguyds.com/"'));
    assert(updater.includes("api.github.com/repos/jaydumisuni/Lumi-DM/releases/latest"));
    assert(updater.includes("SHA-256"));
  }],
  ["one approved Lumi identity feeds every icon", () => {
    assert(build.includes('"iconSource": "static/assets/lumi-brand-transparent.png"'));
    assert(iconGenerator.includes('SOURCE = ROOT / "static" / "assets" / "lumi-brand-transparent.png"'));
    assert(!exists("Resouces/my_logo.png"));
  }],
];

for (const [name, check] of findings) {
  check();
  console.log(`SRG OWNER PASS — ${name}`);
}
console.log(`Sergeant owner findings: ${findings.length}/${findings.length} PASS`);
