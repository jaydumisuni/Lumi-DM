"use strict";

/*
 * Native surface coordinator for issue #8. This module never owns download
 * state. It observes the canonical Runtime and adjusts the existing widget
 * BrowserWindow between compact and expanded geometry for pending browser
 * captures. No confirmation window or second app identity is created.
 */
const { app, BrowserWindow, ipcMain } = require("electron");
const http = require("http");

let forcedPendingExpansion = false;
let lastPendingId = "";
let pollTimer = null;

function request(method, route, body = null, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const payload = body === null ? null : Buffer.from(JSON.stringify(body));
    const req = http.request({
      hostname: "127.0.0.1",
      port: 7000,
      path: route,
      method,
      timeout,
      headers: {
        "X-Lumi-Client": "electron-surface-v7",
        ...(payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}),
      },
    }, response => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { raw += chunk; });
      response.on("end", () => {
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch (_) { data = { error: raw.slice(0, 300) }; }
        if ((response.statusCode || 500) >= 400) {
          reject(new Error(data.error || `Lumi Runtime ${response.statusCode}`));
          return;
        }
        resolve(data);
      });
    });
    req.on("timeout", () => req.destroy(new Error("Lumi Runtime timed out")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function widgetWindow() {
  return BrowserWindow.getAllWindows().find(window => {
    if (window.isDestroyed()) return false;
    const url = String(window.webContents.getURL() || "");
    const bounds = window.getBounds();
    return url.includes("widget.html") || (window.isAlwaysOnTop() && bounds.width <= 520 && bounds.height <= 420);
  }) || null;
}

function mainWindowVisible() {
  return BrowserWindow.getAllWindows().some(window => {
    if (window.isDestroyed()) return false;
    const url = String(window.webContents.getURL() || "");
    if (url.includes("widget.html") || url.includes("confirm.html")) return false;
    const bounds = window.getBounds();
    return bounds.width >= 650 && bounds.height >= 430 && window.isVisible() && !window.isMinimized();
  });
}

function scaleFromBounds(bounds, expanded) {
  return Math.max(0.75, Math.min(1.35, bounds.width / (expanded ? 360 : 240)));
}

function resizeAnchored(window, expand) {
  if (!window || window.isDestroyed()) return;
  const bounds = window.getBounds();
  const currentlyExpanded = bounds.width >= 330 || bounds.height >= 180;
  if (expand === currentlyExpanded) return;
  const scale = scaleFromBounds(bounds, currentlyExpanded);
  const width = Math.round((expand ? 360 : 240) * scale);
  const height = Math.round((expand ? 320 : 66) * scale);
  window.setBounds({
    x: bounds.x + bounds.width - width,
    y: bounds.y + bounds.height - height,
    width,
    height,
  }, true);
  window.setFocusable(expand);
  if (expand) window.show();
  else window.showInactive();
}

function publishPending(task) {
  const window = widgetWindow();
  if (!window || window.isDestroyed()) return;
  window.webContents.send("v7-browser-pending", task || null);
}

async function rpc(method, params = {}) {
  const response = await request("POST", "/api/v7/rpc", { method, params });
  if (!response.ok) throw new Error(response.error || "Lumi RPC failed");
  return response.result;
}

async function pollPending() {
  try {
    const state = await request("GET", "/api/v7/runtime/state");
    const pending = (state.tasks || []).find(task => task.metadata?.browser_capture_pending === true) || null;
    const pendingId = String(pending?.id || "");
    if (pending) {
      const window = widgetWindow();
      if (window && !mainWindowVisible()) {
        resizeAnchored(window, true);
        forcedPendingExpansion = true;
      }
      if (pendingId !== lastPendingId) publishPending(pending);
    } else if (forcedPendingExpansion) {
      const window = widgetWindow();
      resizeAnchored(window, false);
      forcedPendingExpansion = false;
      publishPending(null);
    }
    lastPendingId = pendingId;
  } catch (_) {
    // Runtime supervisor owns recovery. A transient disconnect is reflected by
    // the widget's existing offline state instead of spawning another backend.
  }
}

function installIpc() {
  if (!ipcMain.listenerCount("v7-widget-confirm")) {
    ipcMain.handle("v7-widget-confirm", async (_event, value) => {
      const params = value && typeof value === "object" ? value : {};
      const result = await rpc("browser.confirm", params);
      const window = widgetWindow();
      resizeAnchored(window, false);
      forcedPendingExpansion = false;
      lastPendingId = "";
      publishPending(null);
      return result;
    });
  }
  if (!ipcMain.listenerCount("v7-widget-release")) {
    ipcMain.handle("v7-widget-release", async (_event, taskId) => {
      const result = await rpc("browser.release", { task_id: String(taskId || "") });
      const window = widgetWindow();
      resizeAnchored(window, false);
      forcedPendingExpansion = false;
      lastPendingId = "";
      publishPending(null);
      return result;
    });
  }
  if (!ipcMain.listenerCount("v7-widget-pending")) {
    ipcMain.handle("v7-widget-pending", async () => {
      const state = await request("GET", "/api/v7/runtime/state");
      return (state.tasks || []).find(task => task.metadata?.browser_capture_pending === true) || null;
    });
  }
}

app.whenReady().then(() => {
  installIpc();
  setTimeout(() => {
    void pollPending();
    if (!pollTimer) pollTimer = setInterval(() => void pollPending(), 650);
  }, 1200);
});
app.on("before-quit", () => {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
});

module.exports = { pollPending };
