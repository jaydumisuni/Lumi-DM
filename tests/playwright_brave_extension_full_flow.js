"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const BRAVE = process.env.LUMI_BRAVE_EXECUTABLE || "/usr/bin/brave-browser";
const EXTENSION = path.resolve("static/browser-extension/chromium");
const EXPECTED_ID = "ifgiifbpjflfhibmhaojogjcecpfdljp";
const RUNTIME = "http://127.0.0.1:7000";
const DESKTOP_SECRET = process.env.LUMI_PLAYWRIGHT_DESKTOP_SECRET || "playwright-desktop-secret";
const OUTPUT = process.env.LUMI_BRAVE_PROOF_OUTPUT || path.join(os.tmpdir(), "lumi-brave-extension-proof-downloads");

function assert(value, message) { if (!value) throw new Error(message); }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function runtime(pathname, options = {}) {
  const response = await fetch(`${RUNTIME}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Lumi-Client": "brave-extension-full-proof",
      "X-Lumi-Desktop-Secret": DESKTOP_SECRET,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!response.ok) throw new Error(`${pathname} ${response.status}: ${data.error || text}`);
  return data;
}

async function state() { return runtime("/api/v7/runtime/state"); }

async function waitFor(fn, timeout = 20000, label = "condition") {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try { last = await fn(); if (last) return last; } catch (error) { last = error; }
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${label}: ${last instanceof Error ? last.message : JSON.stringify(last)}`);
}

function serveBuffer(request, response, buffer, contentType, { slowFull = false } = {}) {
  const total = buffer.length;
  response.setHeader("Accept-Ranges", "bytes");
  response.setHeader("Content-Type", contentType);
  if (request.method === "HEAD") {
    response.setHeader("Content-Length", String(total));
    response.writeHead(200); response.end(); return;
  }
  const range = /^bytes=(\d+)-(\d*)$/i.exec(String(request.headers.range || ""));
  if (range) {
    const start = Math.max(0, Number(range[1]));
    const end = Math.min(total - 1, range[2] ? Number(range[2]) : total - 1);
    if (start > end || start >= total) {
      response.writeHead(416, { "Content-Range": `bytes */${total}` }); response.end(); return;
    }
    const body = buffer.subarray(start, end + 1);
    response.writeHead(206, { "Content-Range": `bytes ${start}-${end}/${total}`, "Content-Length": String(body.length) });
    response.end(body); return;
  }
  response.setHeader("Content-Length", String(total));
  response.writeHead(200);
  if (!slowFull) { response.end(buffer); return; }
  let offset = 0;
  const timer = setInterval(() => {
    if (response.destroyed || response.writableEnded) { clearInterval(timer); return; }
    const end = Math.min(total, offset + 64 * 1024);
    response.write(buffer.subarray(offset, end));
    offset = end;
    if (offset >= total) { clearInterval(timer); response.end(); }
  }, 30);
  response.on("close", () => clearInterval(timer));
}

function fixtureServer() {
  const alpha = Buffer.alloc(4 * 1024 * 1024, 0x41);
  const beta = Buffer.alloc(256 * 1024, 0x42);
  const video = Buffer.alloc(1024 * 1024, 0x56);
  return new Promise((resolve, reject) => {
    const server = http.createServer((request, response) => {
      const pathname = new URL(request.url, "http://fixture/").pathname;
      if (pathname === "/") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        response.end(`<!doctype html><html><head><title>Brave Lumi Extension Fixture</title><meta property="og:title" content="Brave Lumi Extension Fixture"></head><body>
          <h1>Brave Lumi Extension Fixture</h1>
          <a id="alpha" download="alpha.bin" href="/files/alpha.bin">Alpha binary</a>
          <a id="beta" href="/files/beta.zip">Beta archive</a>
          <a id="alpha-duplicate" href="/files/alpha.bin">Alpha duplicate</a>
          <video id="fixture-video" controls preload="none" width="640" height="360"><source src="/media/sample.mp4" type="video/mp4"></video>
        </body></html>`);
        return;
      }
      if (pathname === "/files/alpha.bin") return serveBuffer(request, response, alpha, "application/octet-stream", { slowFull: true });
      if (pathname === "/files/beta.zip") return serveBuffer(request, response, beta, "application/zip");
      if (pathname === "/media/sample.mp4") return serveBuffer(request, response, video, "video/mp4");
      response.writeHead(404); response.end("not found");
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.2", () => resolve(server));
  });
}

async function confirmTask(task, filename) {
  const handoffId = task?.metadata?.browser_handoff_id;
  assert(handoffId, `Task has no browser handoff id: ${JSON.stringify(task)}`);
  const response = await runtime("/api/v7/rpc", {
    method: "POST",
    body: JSON.stringify({ method: "browser.confirm", params: { task_id: task.id, filename, target_dir: OUTPUT, connections: 32, start_mode: "now" } }),
  });
  assert(response.ok === true, `V7 browser.confirm failed: ${JSON.stringify(response)}`);
  return response.result;
}

async function main() {
  fs.rmSync(OUTPUT, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT, { recursive: true });
  await waitFor(async () => (await state()).schema === "lumi.runtime.v1", 15000, "Lumi Runtime");

  const fixture = await fixtureServer();
  const port = fixture.address().port;
  const fixtureUrl = `http://127.0.0.2:${port}/`;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-brave-proof-"));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: BRAVE,
    headless: false,
    viewport: { width: 1180, height: 800 },
    acceptDownloads: true,
    args: [
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-component-update",
      "--disable-background-networking",
    ],
  });

  try {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 20000 });
    const extensionId = worker.url().split("/")[2];
    assert(extensionId === EXPECTED_ID, `Brave loaded unexpected Lumi extension id ${extensionId}`);

    const bridge = await waitFor(async () => worker.evaluate(async () => await new Promise(resolve => chrome.storage.local.get(["lumiToken", "lumiLocalIdentity", "lumiBridgeState"], resolve))).then(value => value.lumiToken && value.lumiLocalIdentity && value.lumiBridgeState === "connected" ? value : null), 25000, "Brave persistent bridge");
    console.log("BRAVE_BRIDGE_PASS", JSON.stringify({ extensionId, identity: bridge.lumiLocalIdentity, bridge: bridge.lumiBridgeState }));

    const fixturePage = await context.newPage();
    await fixturePage.goto(fixtureUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
    await fixturePage.locator("#lumi-media-capture-host").waitFor({ state: "attached", timeout: 15000 });

    const fixtureTabId = await worker.evaluate(async url => {
      const tabs = await chrome.tabs.query({});
      return tabs.find(tab => tab.url === url)?.id || 0;
    }, fixtureUrl);
    assert(fixtureTabId, "Could not find fixture tab in Brave");

    // 1) Real popup -> browser anchors -> Runtime pending import -> Lumi LinkGrabber UI.
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`, { waitUntil: "domcontentloaded" });
    await worker.evaluate(async tabId => { await chrome.tabs.update(tabId, { active: true }); }, fixtureTabId);
    await popup.evaluate(() => document.getElementById("refresh").click());
    await popup.locator("#links-card").waitFor({ state: "visible", timeout: 10000 });
    const linksTitle = await popup.locator("#links-title").innerText();
    assert(linksTitle.startsWith("2 link"), `Expected 2 unique page anchors, got ${linksTitle}`);
    await popup.evaluate(() => document.getElementById("grab-links").click());
    const pendingImport = await waitFor(async () => {
      const value = await runtime("/api/v5/browser/linkgrabber/pending");
      return value.import?.count === 2 ? value.import : null;
    }, 12000, "LinkGrabber import");
    assert(new Set(pendingImport.links.map(item => item.url)).size === 2, "LinkGrabber import did not dedupe anchors");

    const manager = await context.newPage();
    await manager.goto(RUNTIME, { waitUntil: "domcontentloaded", timeout: 20000 });
    await manager.locator("#app-shell").waitFor({ state: "visible", timeout: 15000 });
    await manager.locator("#view-grabber.active").waitFor({ state: "visible", timeout: 12000 });
    const grabberText = await manager.locator("#view-grabber").innerText();
    assert(grabberText.includes("alpha.bin") && grabberText.includes("Beta archive"), `Imported links did not render in Lumi LinkGrabber: ${grabberText}`);
    const cleared = await runtime("/api/v5/browser/linkgrabber/pending");
    assert(cleared.import === null, "Manager did not acknowledge imported browser links");
    console.log("BRAVE_LINKGRABBER_PASS", JSON.stringify({ count: pendingImport.count, rendered: true }));

    // 2) Brave's own download is persisted by Lumi before the browser is paused, then completed by Lumi.
    await fixturePage.bringToFront();
    await fixturePage.locator("#alpha").click();
    const browserPending = await waitFor(async () => {
      const value = await state();
      return (value.tasks || []).find(task => String(task.url || "").includes("/files/alpha.bin") && task.metadata?.browser_capture === true && task.metadata?.browser_download_id);
    }, 15000, "automatic browser download capture");
    await confirmTask(browserPending, "brave-alpha.bin");
    const alphaDone = await waitFor(async () => {
      const value = await state();
      return (value.tasks || []).find(task => task.id === browserPending.id && task.status === "completed");
    }, 30000, "Lumi completion for browser file");
    const alphaPath = path.join(OUTPUT, "brave-alpha.bin");
    assert(fs.existsSync(alphaPath), `Lumi browser file is missing: ${alphaPath}`);
    assert(fs.statSync(alphaPath).size === 4 * 1024 * 1024, `Lumi browser file size mismatch: ${fs.statSync(alphaPath).size}`);
    console.log("BRAVE_DOWNLOAD_INTERCEPT_PASS", JSON.stringify({ id: alphaDone.id, bytes: fs.statSync(alphaPath).size, connections: alphaDone.connections }));

    // 3) Real Brave media UI -> direct MP4 variant -> Runtime handoff -> completed file.
    await fixturePage.bringToFront();
    const host = fixturePage.locator("#lumi-media-capture-host");
    await host.locator("button.trigger").click();
    const rows = host.locator("button.row");
    await rows.first().waitFor({ state: "visible", timeout: 20000 });
    const rowCount = await rows.count();
    assert(rowCount >= 1, "Brave media panel found no downloadable video variants");
    const rowTexts = await rows.allInnerTexts();
    const directIndex = rowTexts.findIndex(text => /DIRECT|MP4|video/i.test(text));
    await rows.nth(directIndex >= 0 ? directIndex : 0).click();
    await host.locator(".state.ok").waitFor({ state: "visible", timeout: 12000 });
    const videoPending = await waitFor(async () => {
      const value = await state();
      return (value.tasks || []).find(task => String(task.url || "").includes("/media/sample.mp4") && task.metadata?.browser_capture === true && task.status !== "completed");
    }, 15000, "video browser capture");
    await confirmTask(videoPending, "brave-sample.mp4");
    const videoDone = await waitFor(async () => {
      const value = await state();
      return (value.tasks || []).find(task => task.id === videoPending.id && task.status === "completed");
    }, 30000, "Lumi MP4 completion");
    const videoPath = path.join(OUTPUT, "brave-sample.mp4");
    assert(fs.existsSync(videoPath), `Lumi MP4 is missing: ${videoPath}`);
    assert(fs.statSync(videoPath).size === 1024 * 1024, `Lumi MP4 size mismatch: ${fs.statSync(videoPath).size}`);
    console.log("BRAVE_VIDEO_DOWNLOAD_PASS", JSON.stringify({ id: videoDone.id, variants: rowCount, bytes: fs.statSync(videoPath).size, type: videoDone.type, connections: videoDone.connections }));

    console.log("BRAVE_EXTENSION_FULL_FLOW_PASS", JSON.stringify({ extensionId, linkgrabber: pendingImport.count, normalDownloadBytes: fs.statSync(alphaPath).size, videoBytes: fs.statSync(videoPath).size }));
  } finally {
    await context.close();
    await new Promise(resolve => fixture.close(resolve));
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error("BRAVE_EXTENSION_FULL_FLOW_FAIL", error.stack || error);
  process.exit(1);
});
