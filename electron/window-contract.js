"use strict";

/* Enforces the desktop/window contract without changing the locked widget renderer. */
const { app, nativeImage } = require("electron");
const fs = require("fs");
const path = require("path");

let mainWindow = null;
let widgetWindow = null;
let contractChangingWidget = false;

function approvedIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "static", "favicon-256.png")
    : path.resolve(__dirname, "..", "static", "favicon-256.png");
}

function widgetSettingsPath() {
  return path.join(app.getPath("userData"), "LUMIDM-desktop-widget.json");
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
  const bounds = window.getBounds();
  return bounds.width > 600 && bounds.height > 400;
}

function isWidget(window) {
  if (!window || window.isDestroyed()) return false;
  const bounds = window.getBounds();
  return bounds.width <= 500 && bounds.height <= 500;
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
  try {
    window.setMinimumSize(1024, 640);
    const bounds = window.getBounds();
    if (bounds.width < 1180 || bounds.height < 700) window.setSize(Math.max(1180, bounds.width), Math.max(700, bounds.height), true);
    const icon = nativeImage.createFromPath(approvedIconPath());
    if (!icon.isEmpty()) window.setIcon(icon);
  } catch (_) {}
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
  setInterval(syncWidgetVisibility, 350);
});

module.exports = { syncWidgetVisibility };
