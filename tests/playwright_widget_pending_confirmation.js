"use strict";
const { _electron: electron } = require("playwright");
const fs = require("fs");
const http = require("http");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PYTHON = process.env.LUMIDM_PYTHON || "python3";
const ELECTRON_EXECUTABLE = process.env.LUMI_ELECTRON_EXECUTABLE || "";
const RUNTIME = "http://127.0.0.1:7000";

function assert(value, message) { if (!value) throw new Error(message); }
async function waitFor(fn, message, timeout = 20000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try { last = await fn(); if (last) return last; } catch (_) {}
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  throw new Error(`${message}${last === undefined ? "" : `; last=${JSON.stringify(last)}`}`);
}
function fixture() {
  const total = 8 * 1024 * 1024;
  const server = http.createServer((request, response) => {
    if (!request.url?.startsWith("/capture")) { response.writeHead(404); response.end(); return; }
    const common = { "Content-Type": "application/octet-stream", "Accept-Ranges": "bytes", "Content-Length": total };
    if (request.method === "HEAD") { response.writeHead(200, common); response.end(); return; }
    response.writeHead(200, common); response.end(Buffer.alloc(total, 0x4c));
  });
  return {
    listen: () => new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => resolve(server.address().port)); }),
    close: () => new Promise(resolve => server.close(resolve)),
  };
}
async function nativeWindows(app) {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(window => !window.isDestroyed()).map(window => ({
    url: String(window.webContents.getURL() || ""), visible: window.isVisible(), bounds: window.getBounds(),
  })));
}
async function rpc(secret, method, params = {}) {
  const response = await fetch(`${RUNTIME}/api/v7/rpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Lumi-Client": "widget-pending-proof", "X-Lumi-Desktop-Secret": secret },
    body: JSON.stringify({ method, params }),
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(`${method}: ${response.status} ${data.error || ""}`);
  return data.result;
}
async function state(secret) {
  const response = await fetch(`${RUNTIME}/api/v7/runtime/state`, { headers: { "X-Lumi-Client": "widget-pending-proof", "X-Lumi-Desktop-Secret": secret } });
  if (!response.ok) throw new Error(`runtime state ${response.status}`);
  return response.json();
}
async function main() {
  const dataRoot = path.join(ROOT, ".lumi-data", "widget-pending-proof");
  const downloads = path.join(dataRoot, "downloads");
  const alternate = path.join(dataRoot, "alternate");
  fs.rmSync(dataRoot, { recursive: true, force: true });
  fs.mkdirSync(downloads, { recursive: true });
  fs.mkdirSync(alternate, { recursive: true });
  const fx = fixture();
  const port = await fx.listen();
  let app;
  try {
    app = await electron.launch({
      ...(ELECTRON_EXECUTABLE ? { executablePath: ELECTRON_EXECUTABLE } : {}),
      args: [...(process.platform === "linux" ? ["--no-sandbox"] : []), path.join(ROOT, "electron", "main.js")], cwd: ROOT,
      env: { ...process.env, LUMIDM_PYTHON: PYTHON, LUMIDM_DATA_DIR: dataRoot, LUMIDM_DOWNLOAD_DIR: downloads, LUMIDM_TEMP_DIR: path.join(dataRoot, "temporary") },
      timeout: 30000,
    });
    const manager = await waitFor(() => app.windows().find(page => page.url().startsWith(RUNTIME)), "manager did not load Runtime", 30000);
    await manager.locator("#app-shell").waitFor({ state: "visible", timeout: 20000 });
    const widget = await waitFor(() => app.windows().find(page => page.url().includes("widget.html")), "widget missing", 15000);
    const secret = await waitFor(() => app.evaluate(() => String(process.env.LUMIDM_DESKTOP_SECRET || "")), "desktop secret missing", 10000);
    await manager.click('[data-window-action="close"]');
    await waitFor(async () => {
      const windows = await nativeWindows(app); const main = windows.find(x => x.url.startsWith(RUNTIME)); const w = windows.find(x => x.url.includes("widget.html"));
      return main && !main.visible && w?.visible && w.bounds.width === 240 && w.bounds.height === 66;
    }, "manager close did not hand off to compact widget");

    const source = `http://127.0.0.1:${port}/capture-one.bin`;
    const capture = await rpc(secret, "browser.capture", { source, filename: "captured-original.bin", target_dir: downloads, temp_dir: path.join(dataRoot, "temporary"), queue_id: "default", browser: { url: "https://example.invalid/source-page", title: "Pending proof" } });
    const taskId = String(capture.task?.id || ""); assert(taskId, "capture returned no task");
    await widget.locator("#pending-confirmation").waitFor({ state: "visible", timeout: 12000 });
    const expanded = await waitFor(async () => { const w = (await nativeWindows(app)).find(x => x.url.includes("widget.html")); return w?.bounds.width === 360 && w.bounds.height === 320 ? w : null; }, "pending capture did not expand same widget");
    const windowsDuring = await nativeWindows(app);
    assert(windowsDuring.length === 2, `pending confirmation created extra native surface: ${JSON.stringify(windowsDuring)}`);
    assert(!windowsDuring.some(x => x.url.includes("confirm.html")), "legacy confirm window was created");
    assert((await widget.locator("#pending-filename").inputValue()) === "captured-original.bin", "filename was not populated");
    assert((await widget.locator("#pending-target-dir").inputValue()) === downloads, "target folder was not populated");
    assert((await widget.locator("#pending-source").innerText()).includes("example.invalid/source-page"), "source summary missing browser source");
    assert((await widget.locator("#pending-duplicate").innerText()).toLowerCase().includes("numbered"), "duplicate policy summary missing");

    await widget.locator("#pending-filename").fill("approved-edited-name.bin");
    await widget.locator("#pending-target-dir").fill(alternate);
    await widget.locator('[data-pending-action="later"]').click();
    const confirmed = await waitFor(async () => {
      const s = await state(secret); const task = (s.tasks || []).find(item => String(item.id) === taskId);
      return task && task.metadata?.browser_capture_pending !== true && task.status === "paused" ? task : null;
    }, "Download later did not confirm same task", 12000);
    assert(String(confirmed.id) === taskId, "confirmation replaced canonical task");
    assert(confirmed.filename === "approved-edited-name.bin", `edited filename lost: ${confirmed.filename}`);
    assert(confirmed.target_dir === alternate, `edited target lost: ${confirmed.target_dir}`);
    await waitFor(async () => { const w = (await nativeWindows(app)).find(x => x.url.includes("widget.html")); return w?.bounds.width === 240 && w.bounds.height === 66 ? true : false; }, "confirmation did not collapse widget");

    const source2 = `http://127.0.0.1:${port}/capture-two.bin`;
    const capture2 = await rpc(secret, "browser.capture", { source: source2, filename: "cancel-me.bin", target_dir: downloads, temp_dir: path.join(dataRoot, "temporary"), queue_id: "default", browser: { url: "https://example.invalid/cancel-source", title: "Cancel proof" } });
    const taskId2 = String(capture2.task?.id || "");
    await widget.locator("#pending-confirmation").waitFor({ state: "visible", timeout: 12000 });
    await widget.locator('[data-pending-action="cancel"]').click();
    await waitFor(async () => { const s = await state(secret); return !(s.tasks || []).some(item => String(item.id) === taskId2); }, "Cancel did not remove pending Runtime task", 12000);
    await waitFor(async () => { const w = (await nativeWindows(app)).find(x => x.url.includes("widget.html")); return w?.bounds.width === 240 && w.bounds.height === 66 ? true : false; }, "Cancel did not collapse widget");

    console.log("LUMI_WIDGET_PENDING_CONFIRMATION_PASS", JSON.stringify({ taskId, secondTaskId: taskId2, compact: [240, 66], expanded: [expanded.bounds.width, expanded.bounds.height], filename: confirmed.filename, target: confirmed.target_dir, status: confirmed.status, nativeSurfaces: windowsDuring.length }));
  } finally {
    if (app) await app.close().catch(() => {});
    await fx.close();
  }
}
main().catch(error => { console.error("LUMI_WIDGET_PENDING_CONFIRMATION_FAIL", error.stack || error); process.exitCode = 1; });
