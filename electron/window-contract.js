"use strict";

/*
 * Desktop visibility/file-shell contract. Native main-window geometry is owned
 * exclusively by electron/main.js (920x650 default, 720x500 minimum). This
 * module intentionally does not resize the main window.
 */
const { app, ipcMain, shell } = require("electron");
const fs = require("fs");
const path = require("path");

let mainWindow = null;
let widgetWindow = null;
let contractChangingWidget = false;

function extensionSourcePath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "static", "browser-extension", "chromium")
    : path.resolve(__dirname, "..", "static", "browser-extension", "chromium");
}

function widgetSettingsPath() {
  // Same canonical desktop settings file used by electron/main.js.
  return path.join(app.getPath("userData"), "LUMIDM-desktop.json");
}

function widgetEnabled() {
  try {
    const value = JSON.parse(fs.readFileSync(widgetSettingsPath(), "utf8"));
    return value.visible !== false;
  } catch (_) {
    return true;
  }
}

function isMain(window) {
  if (!window || window.isDestroyed()) return false;
  const url = String(window.webContents.getURL() || "");
  if (url.includes("widget.html") || url.includes("confirm.html")) return false;
  const bounds = window.getBounds();
  return bounds.width > 600 && bounds.height > 400;
}

function isWidget(window) {
  if (!window || window.isDestroyed()) return false;
  const url = String(window.webContents.getURL() || "");
  const bounds = window.getBounds();
  return url.includes("widget.html") || (window.isAlwaysOnTop() && bounds.width <= 520 && bounds.height <= 440);
}

function mainIsOpen() {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized());
}

function changeWidget(visible) {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  contractChangingWidget = true;
  try {
    if (visible && widgetEnabled()) widgetWindow.showInactive();
    else widgetWindow.hide();
  } catch (_) {}
  finally { contractChangingWidget = false; }
}

function syncWidgetVisibility() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  changeWidget(!mainIsOpen());
}

function applyMainContract(window) {
  mainWindow = window;
  window.on("show", syncWidgetVisibility);
  window.on("focus", syncWidgetVisibility);
  window.on("restore", syncWidgetVisibility);
  window.on("maximize", syncWidgetVisibility);
  window.on("minimize", syncWidgetVisibility);
  window.on("hide", syncWidgetVisibility);
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
    syncWidgetVisibility();
  });
  syncWidgetVisibility();
}

function applyWidgetContract(window) {
  widgetWindow = window;
  window.on("show", () => {
    if (!contractChangingWidget && mainIsOpen()) changeWidget(false);
  });
  window.webContents.on("did-finish-load", syncWidgetVisibility);
  window.on("closed", () => { if (widgetWindow === window) widgetWindow = null; });
  syncWidgetVisibility();
}

app.on("browser-window-created", (_event, window) => {
  setImmediate(() => {
    if (isMain(window)) applyMainContract(window);
    else if (isWidget(window)) applyWidgetContract(window);
  });
});

app.whenReady().then(() => {
  ipcMain.removeHandler("ttg-open-path");
  ipcMain.handle("ttg-open-path", async (_event, value) => {
    const target = String(value || "").trim();
    if (!target) throw new Error("No file or folder path was provided");
    const result = await shell.openPath(target);
    if (result) throw new Error(result);
    return { ok: true };
  });

  ipcMain.removeHandler("ttg-open-external");
  ipcMain.handle("ttg-open-external", async (_event, value) => {
    const target = String(value || "").trim();
    if (!/^https?:\/\//i.test(target)) throw new Error("Only HTTP or HTTPS links may be opened");
    await shell.openExternal(target);
    return { ok: true };
  });

  ipcMain.removeHandler("ttg-prepare-browser-extension");
  ipcMain.handle("ttg-prepare-browser-extension", async () => {
    const source = extensionSourcePath();
    if (!fs.existsSync(path.join(source, "manifest.json"))) {
      throw new Error("The Lumi browser extension package is missing from this build");
    }
    const destination = path.join(app.getPath("documents"), "Lumi DM Browser Extension");
    fs.rmSync(destination, { recursive: true, force: true });
    fs.cpSync(source, destination, { recursive: true });
    const result = await shell.openPath(destination);
    if (result) throw new Error(result);
    return { ok: true, path: destination };
  });

  setInterval(syncWidgetVisibility, 350);
});

module.exports = { syncWidgetVisibility };
