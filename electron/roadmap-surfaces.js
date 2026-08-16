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
let surfaceExpanded = false;
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
    return url.includes("widget.html") || (window.isAlwaysOnTop() && bounds.width <= 520 && bounds.height <= 440);
  }) || null;
}

function mainWindow() {
  return BrowserWindow.getAllWindows().find(window => {
    if (window.isDestroyed()) return false;
    const url = String(window.webContents.getURL() || "");
    if (url.includes("widget.html") || url.includes("confirm.html")) return false;
    const bounds = window.getBounds();
    return bounds.width >= 650 && bounds.height >= 430;
  }) || null;
}

function mainWindowVisible() {
  const window = mainWindow();
  return Boolean(window && window.isVisible() && !window.isMinimized());
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

function effectiveExpanded() {
  return forcedPendingExpansion || surfaceExpanded;
}

function publishExpanded() {
  const window = widgetWindow();
  if (window && !window.isDestroyed()) {
    window.webContents.send("v5-expanded", effectiveExpanded());
  }
}

function publishPending(task) {
  const window = widgetWindow();
  if (!window || window.isDestroyed()) return;
  window.webContents.send("v7-browser-pending", task || null);
  if (task) {
    // Presentation-only: the Runtime task is deliberately queued in the
    // inactive browser-pending queue. Select that existing widget tab so the
    // capture is immediately visible instead of appearing as an empty panel.
    void window.webContents.executeJavaScript(
      'document.querySelector(\'[data-tab="queued"]\')?.click()',
      true,
    ).catch(() => {});
  }
}

async function rpc(method, params = {}) {
  const response = await request("POST", "/api/v7/rpc", { method, params });
  if (!response.ok) throw new Error(response.error || "Lumi RPC failed");
  return response.result;
}

async function pendingTask(taskId = "") {
  const state = await request("GET", "/api/v7/runtime/state");
  return (state.tasks || []).find(task => (
    task.metadata?.browser_capture_pending === true
    && (!taskId || String(task.id) === String(taskId))
  )) || null;
}

async function pollPending() {
  try {
    const pending = await pendingTask();
    const pendingId = String(pending?.id || "");
    if (pending) {
      const window = widgetWindow();
      if (window && !mainWindowVisible()) {
        forcedPendingExpansion = true;
        resizeAnchored(window, true);
        publishExpanded();
      }
      if (pendingId !== lastPendingId) publishPending(pending);
    } else if (forcedPendingExpansion) {
      forcedPendingExpansion = false;
      const window = widgetWindow();
      resizeAnchored(window, surfaceExpanded);
      publishExpanded();
      publishPending(null);
    }
    lastPendingId = pendingId;
  } catch (_) {
    // Runtime supervisor owns recovery. A transient disconnect is reflected by
    // the widget's existing offline state instead of spawning another backend.
  }
}

async function normalWidgetAction(action, taskId = "") {
  if (action === "pause-all") return request("POST", "/api/downloads/pause-all", {});
  if (action === "resume-all") return request("POST", "/api/downloads/resume-all", {});
  if (action === "pause" && taskId) return request("POST", `/api/downloads/${encodeURIComponent(taskId)}/pause`, {});
  if (action === "resume" && taskId) return request("POST", `/api/downloads/${encodeURIComponent(taskId)}/resume`, {});
  if (action === "cancel" && taskId) return request("POST", `/api/downloads/${encodeURIComponent(taskId)}/cancel`, {});
  if (action === "open" && taskId) return request("POST", `/api/downloads/${encodeURIComponent(taskId)}/open`, {});
  if (action === "main") {
    const window = mainWindow();
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
    return { ok: Boolean(window) };
  }
  return { ok: false };
}

async function widgetAction(action, taskId = "") {
  if (taskId && ["resume", "cancel"].includes(action)) {
    const pending = await pendingTask(taskId);
    if (pending) {
      if (action === "cancel") {
        const result = await rpc("browser.release", { task_id: taskId });
        forcedPendingExpansion = false;
        lastPendingId = "";
        resizeAnchored(widgetWindow(), surfaceExpanded);
        publishExpanded();
        publishPending(null);
        return result;
      }
      const result = await rpc("browser.confirm", {
        task_id: taskId,
        filename: pending.filename || "download.bin",
        target_dir: pending.target_dir || "",
        queue_id: pending.metadata?.browser_requested_queue || "default",
        start_mode: "now",
        connections: 32,
      });
      forcedPendingExpansion = false;
      lastPendingId = "";
      surfaceExpanded = false;
      resizeAnchored(widgetWindow(), false);
      publishExpanded();
      publishPending(null);
      return result;
    }
  }
  return normalWidgetAction(action, taskId);
}

function installUniqueIpc() {
  ipcMain.removeHandler("v7-widget-confirm");
  ipcMain.handle("v7-widget-confirm", async (_event, value) => {
    const params = value && typeof value === "object" ? value : {};
    const result = await rpc("browser.confirm", params);
    forcedPendingExpansion = false;
    surfaceExpanded = false;
    lastPendingId = "";
    resizeAnchored(widgetWindow(), false);
    publishExpanded();
    publishPending(null);
    return result;
  });
  ipcMain.removeHandler("v7-widget-release");
  ipcMain.handle("v7-widget-release", async (_event, taskId) => widgetAction("cancel", taskId));
  ipcMain.removeHandler("v7-widget-pending");
  ipcMain.handle("v7-widget-pending", async () => pendingTask());
}

function replaceLegacyWidgetHandlers() {
  // main.js registers these during the same app-ready turn. Replacing them on
  // the next task removes the competing private widgetExpanded owner and lets
  // this module own native widget geometry while Runtime remains data authority.
  ipcMain.removeHandler("v5-widget-toggle");
  ipcMain.handle("v5-widget-toggle", () => {
    if (forcedPendingExpansion) return true;
    surfaceExpanded = !surfaceExpanded;
    resizeAnchored(widgetWindow(), surfaceExpanded);
    publishExpanded();
    return surfaceExpanded;
  });

  ipcMain.removeHandler("v5-widget-snapshot");
  ipcMain.handle("v5-widget-snapshot", async () => {
    try {
      const [downloads, net] = await Promise.all([
        request("GET", "/api/downloads?limit=100"),
        request("GET", "/api/netstats").catch(() => ({})),
      ]);
      return {
        online: true,
        downloads: downloads.downloads || [],
        net,
        expanded: effectiveExpanded(),
      };
    } catch (error) {
      return {
        online: false,
        error: String(error.message || error),
        downloads: [],
        net: {},
        expanded: effectiveExpanded(),
      };
    }
  });

  ipcMain.removeHandler("v5-widget-action");
  ipcMain.handle("v5-widget-action", (_event, action, taskId = "") => widgetAction(action, taskId));
}

app.whenReady().then(() => {
  installUniqueIpc();
  setTimeout(() => {
    replaceLegacyWidgetHandlers();
    void pollPending();
    if (!pollTimer) pollTimer = setInterval(() => void pollPending(), 650);
  }, 0);
});
app.on("before-quit", () => {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
});

module.exports = { pollPending };
