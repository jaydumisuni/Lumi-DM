"use strict";

const { _electron: electron } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ARTIFACTS = path.resolve(process.env.LUMI_PLAYWRIGHT_ARTIFACTS || "artifacts");
const PYTHON = process.env.LUMIDM_PYTHON || (process.platform === "win32" ? "python.exe" : "python3");
const RUNTIME = "http://127.0.0.1:7000";
const TOTAL_BYTES = 16 * 1024 * 1024;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitFor(predicate, message, timeout = 20000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      last = await predicate();
      if (last) return last;
    } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  throw new Error(`${message}${last === undefined ? "" : `; last=${JSON.stringify(last)}`}`);
}

function slowRangeFixture() {
  let rangeRequests = 0;
  const server = http.createServer((request, response) => {
    if (request.url !== "/widget-lifecycle.bin") {
      response.writeHead(404);
      response.end("not found");
      return;
    }
    const common = {
      "Content-Type": "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store",
    };
    if (request.method === "HEAD") {
      response.writeHead(200, { ...common, "Content-Length": TOTAL_BYTES });
      response.end();
      return;
    }
    const match = /^bytes=(\d+)-(\d*)$/i.exec(String(request.headers.range || ""));
    if (!match) {
      response.writeHead(200, { ...common, "Content-Length": TOTAL_BYTES });
      setTimeout(() => response.end(Buffer.alloc(TOTAL_BYTES, 0x4c)), 5000);
      return;
    }
    rangeRequests += 1;
    const start = Number(match[1]);
    const end = Math.min(TOTAL_BYTES - 1, match[2] ? Number(match[2]) : TOTAL_BYTES - 1);
    const size = Math.max(0, end - start + 1);
    response.writeHead(206, {
      ...common,
      "Content-Range": `bytes ${start}-${end}/${TOTAL_BYTES}`,
      "Content-Length": size,
    });
    setTimeout(() => {
      if (!response.destroyed) response.end(Buffer.alloc(size, 0x4c));
    }, 5000);
  });
  return {
    server,
    rangeRequests: () => rangeRequests,
    listen: () => new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve(server.address().port));
    }),
    close: () => new Promise(resolve => server.close(resolve)),
  };
}

async function nativeWindows(app) {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(window => !window.isDestroyed()).map(window => ({
    id: window.id,
    url: String(window.webContents.getURL() || ""),
    bounds: window.getBounds(),
    visible: window.isVisible(),
    minimized: window.isMinimized(),
    alwaysOnTop: window.isAlwaysOnTop(),
  })));
}

async function managerPage(app) {
  return waitFor(() => app.windows().find(page => page.url().startsWith(RUNTIME)) || null, "manager never loaded owned Runtime", 30000);
}

async function widgetPage(app) {
  return waitFor(() => app.windows().find(page => page.url().includes("widget.html")) || null, "widget renderer never appeared", 15000);
}

async function rpc(secret, method, params = {}) {
  const response = await fetch(`${RUNTIME}/api/v7/rpc`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Lumi-Client": "playwright-electron-widget-lifecycle",
      "X-Lumi-Desktop-Secret": secret,
    },
    body: JSON.stringify({ method, params }),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch (_) { data = { error: text }; }
  if (!response.ok || !data.ok) throw new Error(`Lumi RPC ${method} failed: ${response.status} ${data.error || text}`);
  return data.result;
}

async function runtimeState(secret) {
  const response = await fetch(`${RUNTIME}/api/v7/runtime/state`, {
    headers: {
      "X-Lumi-Client": "playwright-electron-widget-lifecycle",
      "X-Lumi-Desktop-Secret": secret,
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Runtime state ${response.status}: ${text}`);
  return JSON.parse(text);
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const dataRoot = path.join(ARTIFACTS, "widget-lifecycle-data");
  const downloads = path.join(ARTIFACTS, "widget-lifecycle-downloads");
  const temporary = path.join(ARTIFACTS, "widget-lifecycle-temporary");
  for (const directory of [dataRoot, downloads, temporary]) fs.mkdirSync(directory, { recursive: true });

  const fixture = slowRangeFixture();
  const fixturePort = await fixture.listen();
  const source = `http://127.0.0.1:${fixturePort}/widget-lifecycle.bin`;
  let electronApp = null;
  let taskId = "";

  try {
    electronApp = await electron.launch({
      args: [path.join(ROOT, "electron", "main.js")],
      cwd: ROOT,
      env: {
        ...process.env,
        LUMIDM_PYTHON: PYTHON,
        LUMIDM_DATA_DIR: dataRoot,
        LUMIDM_DOWNLOAD_DIR: downloads,
        LUMIDM_TEMP_DIR: temporary,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      },
      timeout: 30000,
    });

    const manager = await managerPage(electronApp);
    await manager.locator("#app-shell").waitFor({ state: "visible", timeout: 20000 });
    const widget = await widgetPage(electronApp);

    const secret = await waitFor(
      () => electronApp.evaluate(() => String(process.env.LUMIDM_DESKTOP_SECRET || "")),
      "Electron did not publish its owned Runtime credential",
      15000,
    );

    const initialWindows = await nativeWindows(electronApp);
    assert(initialWindows.length === 2, `Expected manager + widget before handoff: ${JSON.stringify(initialWindows)}`);
    assert(!initialWindows.some(window => window.url.includes("confirm.html")), "Legacy confirmation surface exists before handoff");

    await manager.click('[data-window-action="close"]');
    await waitFor(async () => {
      const windows = await nativeWindows(electronApp);
      const mainWindow = windows.find(window => window.url.startsWith(RUNTIME));
      const widgetWindow = windows.find(window => window.url.includes("widget.html"));
      return mainWindow && widgetWindow && !mainWindow.visible && widgetWindow.visible && widgetWindow.bounds.width === 240 && widgetWindow.bounds.height === 66;
    }, "Closing manager did not reveal the same compact widget", 10000);

    const capture = await rpc(secret, "browser.capture", {
      source,
      type: "direct",
      filename: "widget-lifecycle.bin",
      target_dir: downloads,
      temp_dir: temporary,
      queue_id: "default",
      browser: { url: "https://example.invalid/video", title: "Widget lifecycle proof" },
    });
    taskId = String(capture?.task?.id || "");
    assert(taskId, `browser.capture did not return the canonical task: ${JSON.stringify(capture)}`);
    assert(capture.task.queue_id === "browser-pending", `pending task used wrong queue: ${capture.task.queue_id}`);
    assert(capture.task.status === "queued", `pending task used wrong status: ${capture.task.status}`);
    assert(capture.task.metadata?.browser_capture_pending === true, "capture is not marked pending");
    assert(Number(capture.task.connections) === 32, `pending HTTP task lost 32-connection contract: ${capture.task.connections}`);

    const expanded = await waitFor(async () => {
      const windows = await nativeWindows(electronApp);
      const widgetWindow = windows.find(window => window.url.includes("widget.html"));
      return widgetWindow && widgetWindow.visible && widgetWindow.bounds.width >= 350 && widgetWindow.bounds.height >= 300 ? widgetWindow : null;
    }, "Browser capture did not expand the existing widget", 15000);
    assert((await nativeWindows(electronApp)).length === 2, "Browser capture created a third native surface");
    assert(!String(expanded.url).includes("confirm.html"), "Browser capture expanded a legacy confirmation surface");

    await widget.locator('#widget.expanded').waitFor({ state: "visible", timeout: 8000 });
    await widget.locator('[data-tab="queued"].active').waitFor({ state: "visible", timeout: 8000 });
    const start = widget.locator(`button[data-action="resume"][data-id="${taskId}"]`);
    await start.waitFor({ state: "visible", timeout: 8000 });
    const hit = await start.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return Boolean(target && (target === element || element.contains(target)));
    });
    assert(hit, "Pending Start button is not the physical hit target");
    await widget.screenshot({ path: path.join(ARTIFACTS, "electron-widget-01-pending-expanded.png") });

    await start.click();
    const confirmed = await waitFor(async () => {
      const state = await runtimeState(secret);
      const task = (state.tasks || []).find(item => String(item.id) === taskId);
      if (!task || task.metadata?.browser_capture_pending === true) return null;
      return task;
    }, "Widget Start did not confirm the same Runtime task", 12000);
    assert(String(confirmed.id) === taskId, "Widget Start replaced the pending task instead of continuing it");
    assert(String(confirmed.queue_id) === "default", `confirmed task did not return to requested queue: ${confirmed.queue_id}`);
    assert(Number(confirmed.connections) === 32, `confirmed task lost 32-connection contract: ${confirmed.connections}`);

    await waitFor(async () => {
      const windows = await nativeWindows(electronApp);
      const widgetWindow = windows.find(window => window.url.includes("widget.html"));
      return widgetWindow && widgetWindow.visible && widgetWindow.bounds.width === 240 && widgetWindow.bounds.height === 66 ? widgetWindow : null;
    }, "Starting the pending download did not collapse the same widget", 10000);
    assert((await nativeWindows(electronApp)).length === 2, "Widget Start created an unexpected native surface");
    await widget.locator("#widget:not(.expanded)").waitFor({ state: "visible", timeout: 8000 });
    await waitFor(async () => {
      const text = await widget.locator("#filename-a").innerText().catch(() => "");
      return text.includes("widget-lifecycle.bin") ? text : "";
    }, "Compact widget did not take over progress for the confirmed task", 8000);
    await widget.screenshot({ path: path.join(ARTIFACTS, "electron-widget-02-running-compact.png") });

    await waitFor(() => fixture.rangeRequests() > 1 ? fixture.rangeRequests() : 0, "Confirmed task never reached the segmented HTTP fixture", 8000);
    console.log("LUMI_WIDGET_HANDOFF_PASS", JSON.stringify({
      taskId,
      pendingBounds: expanded.bounds,
      confirmedStatus: confirmed.status,
      rangeRequests: fixture.rangeRequests(),
      nativeSurfaces: (await nativeWindows(electronApp)).length,
    }));
  } finally {
    if (electronApp && taskId) {
      try {
        const secret = await electronApp.evaluate(() => String(process.env.LUMIDM_DESKTOP_SECRET || ""));
        if (secret) await rpc(secret, "download.cancel", { task_id: taskId });
      } catch (_) {}
    }
    if (electronApp) {
      try { await electronApp.close(); } catch (_) {}
    }
    await fixture.close();
  }
}

main().catch(error => {
  console.error("LUMI_WIDGET_HANDOFF_FAIL", error.stack || error);
  process.exitCode = 1;
});
