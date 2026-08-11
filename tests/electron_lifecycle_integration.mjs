import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { _electron: electron } = require("playwright");
const electronExecutable = require("electron");

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const isolated = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-electron-lifecycle-"));
const mainSource = fs.readFileSync(path.join(root, "electron", "main.js"), "utf8");

// Electron has a setter but no BrowserWindow getter for skipTaskbar. Prove the
// exact source contract and use real window dimensions/always-on-top state to
// identify the main and widget windows during the runtime test.
assert.match(mainSource, /skipTaskbar:\s*true/);
assert.match(mainSource, /widgetWindow\.setSkipTaskbar\(true\)/);

const app = await electron.launch({
  executablePath: electronExecutable,
  args: [path.join(root, "electron", "main.js")],
  env: {
    ...process.env,
    LUMIDM_DATA_DIR: path.join(isolated, "data"),
    LUMIDM_DOWNLOAD_DIR: path.join(isolated, "downloads"),
    LUMIDM_TEMP_DIR: path.join(isolated, "temporary"),
    LUMIDM_PYTHON: process.env.LUMIDM_PYTHON || "python",
    ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
  },
  timeout: 120_000,
});

async function waitFor(predicate, message, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  throw new Error(message);
}

async function windows() {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
    .filter(window => !window.isDestroyed())
    .map(window => ({
      id: window.id,
      title: window.getTitle(),
      visible: window.isVisible(),
      focused: window.isFocused(),
      alwaysOnTop: window.isAlwaysOnTop(),
      focusable: window.isFocusable(),
      bounds: window.getBounds(),
      url: window.webContents.getURL(),
    })));
}

const isMain = window => window.bounds.width >= 900 && !window.alwaysOnTop;
const isWidget = window => window.bounds.width <= 500 && window.alwaysOnTop;

try {
  const page = await app.firstWindow({ timeout: 120_000 });
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:7000\/?$/, { timeout: 120_000 });
  await page.waitForFunction(() => Boolean(window.LumiReplica?.state && window.electronApp?.isElectron));

  // Renderer readiness can occur just before loadURL resolves and main.js calls
  // BrowserWindow.show(). Wait for the native visibility transition instead of
  // racing it with the renderer-ready signal.
  const initial = await waitFor(async () => {
    const all = await windows();
    const candidate = all.find(isMain);
    return candidate?.visible ? all : null;
  }, "normal launch did not show the main window");
  const main = initial.find(isMain);
  assert.ok(main, "actual Lumi main BrowserWindow is present");
  assert.equal(main.visible, true, "normal launch shows the main window");
  assert.equal(initial.filter(isWidget).length, 0, "normal launch does not create a separate widget window");

  const startupResult = await page.evaluate(async () => {
    const enabled = await window.electronApp.saveDesktopSettings({ startAtLogin: true });
    const disabled = await window.electronApp.saveDesktopSettings({ startAtLogin: false });
    return {
      enabled: enabled.startAtLogin,
      disabled: disabled.startAtLogin,
      displays: disabled.displays,
    };
  });
  assert.equal(typeof startupResult.enabled, "boolean", "Windows login registration returns a real state");
  assert.equal(startupResult.disabled, false, "startup registration can be disabled again");
  assert.ok(Array.isArray(startupResult.displays) && startupResult.displays.length > 0, "desktop settings use real display data");

  await app.evaluate(({ BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows().find(window => !window.isDestroyed() && window.getBounds().width >= 900 && !window.isAlwaysOnTop());
    if (!mainWindow) throw new Error("main window missing before close-to-tray proof");
    mainWindow.close();
  });

  const hiddenMain = await waitFor(async () => {
    const all = await windows();
    const candidate = all.find(isMain);
    return candidate && !candidate.visible ? candidate : null;
  }, "closing the main window did not hide it into the tray process");
  assert.equal(hiddenMain.visible, false, "main close hides rather than destroys the app");

  // A hidden BrowserWindow renderer remains alive because Lumi is still running
  // in the tray. Ask that same renderer to show the optional widget.
  await page.evaluate(() => window.electronApp.showWidget());
  const widget = await waitFor(async () => {
    const all = await windows();
    return all.find(isWidget) || null;
  }, "actual Lumi widget did not open from the tray process");
  assert.equal(widget.visible, true, "widget becomes visible only when explicitly opened");
  assert.equal(widget.alwaysOnTop, true, "widget uses its real always-on-top window contract");

  await app.evaluate(({ BrowserWindow }) => {
    const all = BrowserWindow.getAllWindows().filter(window => !window.isDestroyed());
    const mainWindow = all.find(window => window.getBounds().width >= 900 && !window.isAlwaysOnTop());
    if (!mainWindow) throw new Error("main window missing before widget-isolation proof");
    mainWindow.show();
    mainWindow.focus();
  });

  await waitFor(async () => {
    const all = await windows();
    const mainWindow = all.find(isMain);
    const widgetWindow = all.find(isWidget);
    return mainWindow?.visible && widgetWindow && !widgetWindow.visible;
  }, "showing the main window did not hide the widget");

  // Close once more and prove the process can still answer Electron evaluate,
  // which distinguishes tray residency from an exited app.
  await app.evaluate(({ BrowserWindow }) => {
    const mainWindow = BrowserWindow.getAllWindows().find(window => !window.isDestroyed() && window.getBounds().width >= 900 && !window.isAlwaysOnTop());
    mainWindow?.close();
  });
  await waitFor(async () => {
    const all = await windows();
    return all.some(window => isMain(window) && !window.visible);
  }, "second close did not preserve the Lumi tray process");
  const alive = await app.evaluate(({ app: electronApp, BrowserWindow }) => ({
    ready: electronApp.isReady(),
    windowCount: BrowserWindow.getAllWindows().filter(window => !window.isDestroyed()).length,
  }));
  assert.equal(alive.ready, true, "Electron process remains ready after close-to-tray");
  assert.ok(alive.windowCount >= 1, "tray process retains the hidden main window");

  console.log("Actual Windows Electron lifecycle: startup, taskbar source contract, close-to-tray, widget isolation PASS");
} finally {
  await app.close().catch(() => {});
  fs.rmSync(isolated, { recursive: true, force: true });
}
