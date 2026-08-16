"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const EXPECTED_ID = "ifgiifbpjflfhibmhaojogjcecpfdljp";
const RUNTIME = process.env.LUMI_PLAYWRIGHT_BASE || "http://127.0.0.1:7000";
const DESKTOP_SECRET = process.env.LUMIDM_DESKTOP_SECRET || "playwright-desktop-secret";
const EXTENSION = path.resolve("static/browser-extension/chromium");
const ARTIFACTS = path.resolve(process.env.LUMI_PLAYWRIGHT_ARTIFACTS || "artifacts");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fixtureServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      if (request.url === "/" || request.url.startsWith("/?")) {
        const sources = Array.from({ length: 14 }, (_, index) => {
          const height = 144 + index * 72;
          return `<source src="/media/variant-${index}-${height}p.mp4" type="video/mp4">`;
        }).join("");
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        response.end(`<!doctype html><html><head><title>Fourteen Lumi Media Variants</title><meta property="og:title" content="Fourteen Lumi Media Variants"></head><body style="margin:0;background:#111;color:white"><main style="padding:30px"><h1>Fixture video</h1><video id="fixture-video" controls preload="none" style="width:640px;height:360px;background:#000">${sources}<track src="/captions/en.vtt" srclang="en" label="English"></video></main></body></html>`);
        return;
      }
      if (request.url.startsWith("/captions/")) {
        response.writeHead(200, { "Content-Type": "text/vtt" });
        response.end("WEBVTT\n\n00:00.000 --> 00:01.000\nLumi fixture\n");
        return;
      }
      if (request.url.startsWith("/media/")) {
        const total = 4 * 1024 * 1024;
        const range = String(request.headers.range || "");
        if (request.method === "HEAD") {
          response.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": total, "Accept-Ranges": "bytes" });
          response.end();
          return;
        }
        const match = /bytes=(\d+)-(\d*)/.exec(range);
        if (match) {
          const start = Number(match[1]);
          const end = Math.min(total - 1, match[2] ? Number(match[2]) : total - 1);
          const size = Math.max(0, end - start + 1);
          response.writeHead(206, {
            "Content-Type": "video/mp4",
            "Accept-Ranges": "bytes",
            "Content-Range": `bytes ${start}-${end}/${total}`,
            "Content-Length": size,
          });
          response.end(Buffer.alloc(Math.min(size, 256 * 1024), 0x4c));
          return;
        }
        response.writeHead(200, { "Content-Type": "video/mp4", "Content-Length": total, "Accept-Ranges": "bytes" });
        response.end(Buffer.alloc(64 * 1024, 0x4c));
        return;
      }
      response.writeHead(404);
      response.end("not found");
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function runtimeState() {
  const response = await fetch(`${RUNTIME}/api/v7/runtime/state`, {
    headers: {
      "X-Lumi-Client": "playwright-extension-proof",
      "X-Lumi-Desktop-Secret": DESKTOP_SECRET,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Runtime state ${response.status}: ${text}`);
  return JSON.parse(text);
}

async function waitRuntime() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const state = await runtimeState();
      if (state.schema === "lumi.runtime.v1") return state;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error("Lumi Runtime did not become ready for extension proof");
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  await waitRuntime();
  const fixture = await fixtureServer();
  const address = fixture.address();
  const fixturePort = address.port;
  const fixtureUrl = `http://lumi-fixture.test:${fixturePort}/`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-extension-playwright-"));

  const context = await chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: true,
    viewport: { width: 1100, height: 760 },
    args: [
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
      "--host-resolver-rules=MAP lumi-fixture.test 127.0.0.1",
    ],
  });

  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
    const extensionId = worker.url().split("/")[2];
    console.log("PLAYWRIGHT_EXTENSION_ID", extensionId);
    assert(extensionId === EXPECTED_ID, `Bundled extension ID drifted: ${extensionId}`);

    const deadline = Date.now() + 20000;
    let bridgeState = {};
    while (Date.now() < deadline) {
      bridgeState = await worker.evaluate(async () => await new Promise(resolve => chrome.storage.local.get(["lumiToken", "lumiLocalIdentity", "lumiBridgeState"], resolve)));
      if (bridgeState.lumiToken && bridgeState.lumiLocalIdentity && bridgeState.lumiBridgeState === "connected") break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    console.log("PLAYWRIGHT_EXTENSION_BRIDGE", JSON.stringify({ identity: bridgeState.lumiLocalIdentity, bridge: bridgeState.lumiBridgeState, token: Boolean(bridgeState.lumiToken) }));
    assert(bridgeState.lumiLocalIdentity === true, "Extension did not acquire automatic same-PC identity");
    assert(Boolean(bridgeState.lumiToken), "Extension did not receive a local Runtime token");
    assert(bridgeState.lumiBridgeState === "connected", `Persistent browser bridge is not connected: ${bridgeState.lumiBridgeState}`);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "domcontentloaded" });
    await popup.waitForFunction(() => document.getElementById("connection-title")?.textContent === "Lumi is ready", null, { timeout: 15000 });
    const popupText = await popup.locator("body").innerText();
    assert(!popupText.includes("Pair with Lumi"), "Same-PC popup still exposes a pairing ceremony");
    assert(popupText.includes("Automatic local trust"), "Popup does not describe the same-PC trust boundary");
    await popup.screenshot({ path: path.join(ARTIFACTS, "lumi-extension-popup.png") });

    const page = await context.newPage();
    await page.goto(fixtureUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    const host = page.locator("#lumi-media-capture-host");
    await host.waitFor({ state: "attached", timeout: 12000 });
    await host.locator("button.trigger").click();
    const rows = host.locator("button.row");
    await rows.first().waitFor({ state: "visible", timeout: 20000 });
    const count = await rows.count();
    console.log("PLAYWRIGHT_EXTENSION_VARIANTS", count);
    assert(count >= 14, `Media UI truncated or failed to resolve browser variants: ${count}`);
    const panelText = await host.locator(".panel").innerText();
    assert(!panelText.includes("authentication required"), "Media panel is still hitting the Runtime as an unauthenticated app");
    assert(!panelText.includes("Finding downloadable media…"), "Media panel remained in a non-terminal spinner state");

    await page.screenshot({ path: path.join(ARTIFACTS, "lumi-extension-media-panel.png"), fullPage: false });
    await rows.first().click();
    await host.locator(".state.ok").waitFor({ state: "visible", timeout: 12000 });

    const pendingDeadline = Date.now() + 12000;
    let pending = null;
    while (Date.now() < pendingDeadline) {
      const state = await runtimeState();
      pending = (state.tasks || []).find(task => task.metadata?.browser_capture_pending === true);
      if (pending) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    assert(pending, "Selected browser media did not reach the canonical Lumi Runtime");
    assert(pending.connections === 32 || pending.type === "video", `Pending browser task silently downgraded: ${pending.connections}`);
    assert(pending.queue_id === "browser-pending", `Browser task did not land in the existing widget queue: ${pending.queue_id}`);
    assert(pending.status === "queued", `Browser task used the legacy confirmation status: ${pending.status}`);
    console.log("PLAYWRIGHT_EXTENSION_RESULT", JSON.stringify({ extensionId, variants: count, bridge: bridgeState.lumiBridgeState, pending: { id: pending.id, type: pending.type, status: pending.status, queue: pending.queue_id, connections: pending.connections } }));
  } finally {
    await context.close();
    await new Promise(resolve => fixture.close(resolve));
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error("PLAYWRIGHT_EXTENSION_FAILURE", error.stack || error);
  process.exitCode = 1;
});
