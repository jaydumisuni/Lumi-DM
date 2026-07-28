"use strict";

/* Enforces the desktop/window contract without touching the locked widget renderer. */
const { app, BrowserWindow, nativeImage } = require("electron");
const path = require("path");

let mainWindow = null;
let widgetWindow = null;

function approvedIconPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "static", "favicon-256.png")
    : path.resolve(__dirname, "..", "static", "favicon-256.png");
}

function isMain(window) {
  if (!window || window.isDestroyed()) return false;
  const options = window.getBounds();
  return !window.isSkipTaskbar?.() && options.width > 600 && options.height > 400;
}

function isWidget(window) {
  if (!window || window.isDestroyed()) return false;
  const bounds = window.getBounds();
  return window.isSkipTaskbar?.() === true && bounds.width <= 500 && bounds.height <= 500;
}

function mainIsOpen() {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized());
}

function syncWidgetVisibility() {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  if (mainIsOpen()) widgetWindow.hide();
}

function applyMainContract(window) {
  mainWindow = window;
  try {
    window.setMinimumSize(1024, 680);
    const bounds = window.getBounds();
    if (bounds.width < 1180 || bounds.height < 740) window.setSize(Math.max(1180, bounds.width), Math.max(740, bounds.height), true);
    const icon = nativeImage.createFromPath(approvedIconPath());
    if (!icon.isEmpty()) window.setIcon(icon);
  } catch (_) {}
  const hide = () => syncWidgetVisibility();
  window.on("show", hide);
  window.on("focus", hide);
  window.on("restore", hide);
  window.on("maximize", hide);
  window.on("closed", () => { if (mainWindow === window) mainWindow = null; });
}

function applyWidgetContract(window) {
  widgetWindow = window;
  const guard = () => { if (mainIsOpen()) window.hide(); };
  window.on("show", guard);
  window.webContents.on("did-finish-load", guard);
  window.on("closed", () => { if (widgetWindow === window) widgetWindow = null; });
  guard();
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
