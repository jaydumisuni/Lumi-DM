"use strict";

const { _electron: electron } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ARTIFACTS = path.resolve(process.env.LUMI_PLAYWRIGHT_ARTIFACTS || "artifacts");
const PYTHON = process.env.LUMIDM_PYTHON || (process.platform === "win32" ? "python.exe" : "python3");
const TRACE_FILE = path.join(ARTIFACTS, "electron-source-trace.jsonl");

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
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(`${message}${last === undefined ? "" : `; last=${JSON.stringify(last)}`}`);
}

async function nativeWindows(app) {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(window => !window.isDestroyed()).map(window => ({
    id: window.id,
    url: String(window.webContents.getURL() || ""),
    title: window.getTitle(),
    bounds: window.getBounds(),
    visible: window.isVisible(),
    minimized: window.isMinimized(),
    maximized: window.isMaximized(),
    alwaysOnTop: window.isAlwaysOnTop(),
    skipTaskbar: window.isSkipTaskbar?.() ?? false,
  })));
}

async function managerPage(app) {
  return waitFor(async () => {
    const pages = app.windows();
    for (const page of pages) {
      if (page.url().startsWith("http://127.0.0.1:7000")) return page;
    }
    return null;
  }, "Electron manager never loaded the owned Runtime", 30000);
}

function traceRecords() {
  if (!fs.existsSync(TRACE_FILE)) return [];
  return fs.readFileSync(TRACE_FILE, "utf8")
    .split(/\r?\n/u)
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch (_) { return null; }
    })
    .filter(Boolean);
}

async function waitForIpcResponse(channel, previousCount = 0) {
  return waitFor(() => traceRecords().filter(record => (
    record.process === "electron-main"
    && record.source === "preload-main"
    && record.event === "RESPONSE_RECEIVED"
    && record.channel === channel
    && record.ok === true
  )).length > previousCount, `No successful preload→IPC response trace for ${channel}`, 10000);
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  try { fs.rmSync(TRACE_FILE, { force: true }); } catch (_) {}
  const dataRoot = path.join(ARTIFACTS, "electron-source-data");
  const downloads = path.join(ARTIFACTS, "electron-source-downloads");
  const temporary = path.join(ARTIFACTS, "electron-source-temporary");
  for (const directory of [dataRoot, downloads, temporary]) fs.mkdirSync(directory, { recursive: true });

  const electronApp = await electron.launch({
    args: [path.join(ROOT, "electron", "main.js")],
    cwd: ROOT,
    env: {
      ...process.env,
      LUMIDM_PYTHON: PYTHON,
      LUMIDM_DATA_DIR: dataRoot,
      LUMIDM_DOWNLOAD_DIR: downloads,
      LUMIDM_TEMP_DIR: temporary,
      LUMIDM_STAGE0_ELECTRON_TRACE: TRACE_FILE,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    },
    timeout: 30000,
  });

  const mainConsoleErrors = [];
  electronApp.on("console", message => {
    if (message.type() === "error") mainConsoleErrors.push(message.text());
  });

  try {
    const platform = await electronApp.evaluate(() => process.platform);
    const page = await managerPage(electronApp);
    await page.locator("#app-shell").waitFor({ state: "visible", timeout: 20000 });
    await page.waitForFunction(() => document.documentElement.dataset.lumiRoadmapInteraction === "1");
    await page.waitForFunction(() => Boolean(window.electronApp?.isElectron));

    const initial = await nativeWindows(electronApp);
    console.log("ELECTRON_SOURCE_WINDOWS_INITIAL", JSON.stringify(initial));
    const manager = initial.find(window => window.url.startsWith("http://127.0.0.1:7000"));
    const widget = initial.find(window => window.url.includes("widget.html"));
    assert(manager, "No native manager BrowserWindow owns the Runtime renderer");
    assert(widget, "No native Lumi widget BrowserWindow exists");
    assert(initial.length === 2, `Unexpected native surface count: ${JSON.stringify(initial)}`);
    assert(!initial.some(window => window.url.includes("confirm.html")), "Legacy confirmation BrowserWindow still exists");
    assert(!initial.some(window => window.url.includes("runtime-error.html")), "Source Electron fell into Runtime recovery instead of the owned Runtime");
    assert(manager.bounds.width === 920 && manager.bounds.height === 560, `Wrong native manager bounds: ${JSON.stringify(manager.bounds)}`);
    assert(manager.visible, "Main manager is not visible on a normal source launch");

    await waitFor(async () => {
      const windows = await nativeWindows(electronApp);
      const currentWidget = windows.find(window => window.url.includes("widget.html"));
      return currentWidget && !currentWidget.visible;
    }, "Widget remained visible while the main manager was visible", 10000);

    for (const selector of ["#ttg-bell", "#ttg-gear", '[data-window-action="minimize"]', '[data-window-action="maximize"]', '[data-window-action="close"]']) {
      const hit = await page.locator(selector).evaluate(element => {
        const rect = element.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return Boolean(target && (target === element || element.contains(target)));
      });
      assert(hit, `${selector} is not the native renderer hit target`);
    }

    await page.click("#ttg-gear");
    await page.locator("#ttg-gear-menu").waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(ARTIFACTS, "electron-source-01-gear.png") });
    await page.click("#ttg-gear");

    await page.click("#ttg-bell");
    await page.locator("#ttg-notification-menu").waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(ARTIFACTS, "electron-source-02-notifications.png") });
    await page.click("#ttg-bell");

    let responseCount = traceRecords().filter(record => record.event === "RESPONSE_RECEIVED" && record.channel === "ttg-window-control").length;
    await page.click('[data-window-action="minimize"]');
    await waitForIpcResponse("ttg-window-control", responseCount);
    responseCount += 1;
    if (platform === "win32") {
      await waitFor(async () => {
        const windows = await nativeWindows(electronApp);
        return Boolean(windows.find(window => window.url.startsWith("http://127.0.0.1:7000") && window.minimized));
      }, "Real minimize IPC did not minimize the native manager");
    }
    await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(candidate => String(candidate.webContents.getURL() || "").startsWith("http://127.0.0.1:7000"));
      if (window?.isMinimized()) window.restore();
      window?.show();
      window?.focus();
    });

    await page.click('[data-window-action="maximize"]');
    await waitForIpcResponse("ttg-window-control", responseCount);
    responseCount += 1;
    if (platform === "win32") {
      await waitFor(async () => {
        const windows = await nativeWindows(electronApp);
        return Boolean(windows.find(window => window.url.startsWith("http://127.0.0.1:7000") && window.maximized));
      }, "Real maximize IPC did not maximize the native manager");
    }
    await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows().find(candidate => String(candidate.webContents.getURL() || "").startsWith("http://127.0.0.1:7000"));
      if (window?.isMaximized()) window.unmaximize();
      window?.show();
      window?.focus();
    });
    await waitFor(async () => {
      const windows = await nativeWindows(electronApp);
      const current = windows.find(window => window.url.startsWith("http://127.0.0.1:7000"));
      return current && !current.maximized && current.bounds.width === 920 && current.bounds.height === 560;
    }, "Manager did not return to the 920x560 native contract after restore");

    await page.screenshot({ path: path.join(ARTIFACTS, "electron-source-03-manager.png") });

    await page.click('[data-window-action="close"]');
    await waitForIpcResponse("ttg-window-control", responseCount);
    await waitFor(async () => {
      const windows = await nativeWindows(electronApp);
      const currentManager = windows.find(window => window.url.startsWith("http://127.0.0.1:7000"));
      const currentWidget = windows.find(window => window.url.includes("widget.html"));
      return currentManager && currentWidget && !currentManager.visible && currentWidget.visible;
    }, "Close-to-widget lifecycle did not hide main and reveal the existing widget", 10000);

    const afterClose = await nativeWindows(electronApp);
    console.log("ELECTRON_SOURCE_WINDOWS_AFTER_CLOSE", JSON.stringify(afterClose));
    assert(afterClose.length === 2, `Close lifecycle created an unexpected surface: ${JSON.stringify(afterClose)}`);
    assert(!afterClose.some(window => window.url.includes("confirm.html")), "Close lifecycle created a legacy confirmation surface");

    const widgetPage = electronApp.windows().find(candidate => candidate.url().includes("widget.html"));
    assert(widgetPage, "Widget renderer unavailable after close");
    await widgetPage.screenshot({ path: path.join(ARTIFACTS, "electron-source-04-widget.png") });

    const controlResponses = traceRecords().filter(record => record.event === "RESPONSE_RECEIVED" && record.channel === "ttg-window-control" && record.ok === true);
    assert(controlResponses.length >= 3, `Native window controls did not produce three successful IPC responses: ${JSON.stringify(controlResponses)}`);
    assert(mainConsoleErrors.length === 0, `Electron main-process console errors: ${mainConsoleErrors.join(" | ")}`);
    console.log("LUMI_ELECTRON_SOURCE_SHELL_PASS", JSON.stringify({ platform, initial, afterClose, controlResponses: controlResponses.length }));
  } finally {
    await electronApp.close();
  }
}

main().catch(error => {
  console.error("LUMI_ELECTRON_SOURCE_SHELL_FAIL", error.stack || error);
  process.exitCode = 1;
});
