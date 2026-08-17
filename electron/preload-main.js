"use strict";

const { contextBridge, ipcRenderer } = require("electron");

let lastTraceId = "";
let traceExpiresAt = 0;
let traceCounter = 0;

function nextTraceId() {
  // Sandboxed preload scripts cannot depend on arbitrary Node core modules.
  // This identifier is correlation metadata only, not a credential.
  traceCounter += 1;
  const random = Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, "0");
  return `lumi-${Date.now().toString(36)}-${traceCounter.toString(36)}-${random}`;
}

function currentTraceId() {
  if (lastTraceId && Date.now() <= traceExpiresAt) return lastTraceId;
  return "";
}

function traceStage0(value = {}) {
  const traceId = String(value.trace_id || currentTraceId() || nextTraceId());
  lastTraceId = traceId;
  traceExpiresAt = Date.now() + 5000;
  const payload = {
    event: String(value.event || "TRACE").slice(0, 120),
    trace_id: traceId,
    source: String(value.source || "preload-main").slice(0, 80),
  };
  for (const key of ["action", "channel", "method", "path", "reason"]) {
    if (value[key] !== undefined && value[key] !== null) payload[key] = String(value[key]).replace(/[\r\n\t]+/g, " ").slice(0, 180);
  }
  for (const key of ["status", "ok"]) {
    if (value[key] !== undefined && value[key] !== null) payload[key] = value[key];
  }
  // Persistence belongs to the Electron main process. The sandboxed preload
  // sends only bounded metadata and never touches fs/path/os/crypto directly.
  ipcRenderer.send("ttg-stage0-trace", payload);
  return traceId;
}

async function invokeWithTrace(channel, ...args) {
  const traceId = currentTraceId() || nextTraceId();
  traceStage0({ event: "TRANSPORT_SENT", channel, trace_id: traceId, source: "preload-main" });
  try {
    const result = await ipcRenderer.invoke(channel, ...args);
    traceStage0({ event: "RESPONSE_RECEIVED", channel, trace_id: traceId, ok: true, source: "preload-main" });
    return result;
  } catch (error) {
    traceStage0({
      event: "TRANSPORT_ERROR",
      channel,
      trace_id: traceId,
      ok: false,
      reason: String(error?.message || error || "IPC invocation failed"),
      source: "preload-main",
    });
    throw error;
  }
}

contextBridge.exposeInMainWorld("electronApp", {
  traceStage0,
  pickFolder: () => invokeWithTrace("pick-folder"),
  openPath: value => invokeWithTrace("ttg-open-path", value),
  openExternal: value => invokeWithTrace("ttg-open-external", value),
  prepareBrowserExtension: () => invokeWithTrace("ttg-prepare-browser-extension"),
  isElectron: true,
  getDesktopSettings: () => invokeWithTrace("v5-desktop-settings-get"),
  saveDesktopSettings: value => invokeWithTrace("v5-desktop-settings-save", value),
  showWidget: () => ipcRenderer.send("v5-widget-show"),
  checkForUpdates: (manual = false) => invokeWithTrace("v5-update-check", manual),
  getConnectionCapacity: () => invokeWithTrace("v6-capacity-status"),
  runConnectionCapacityTest: () => invokeWithTrace("v6-capacity-run"),
  windowControl: action => invokeWithTrace("ttg-window-control", action),
  getWindowState: () => invokeWithTrace("ttg-window-state"),
  getAppInfo: () => invokeWithTrace("ttg-app-info"),
  onWindowState: callback => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, value) => callback(value || {});
    ipcRenderer.on("ttg-window-state-changed", listener);
    return () => ipcRenderer.removeListener("ttg-window-state-changed", listener);
  },
  onUpdateStatus: callback => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, value) => callback(value);
    ipcRenderer.on("v5-update-status", listener);
    return () => ipcRenderer.removeListener("v5-update-status", listener);
  },
  onConnectionCapacity: callback => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, value) => callback(value || {});
    ipcRenderer.on("v6-capacity-status", listener);
    return () => ipcRenderer.removeListener("v6-capacity-status", listener);
  },
  onServerState: callback => {
    if (typeof callback !== "function") return () => {};
    const listener = (_event, value) => callback(value || {});
    ipcRenderer.on("lumi-server-state", listener);
    return () => ipcRenderer.removeListener("lumi-server-state", listener);
  },
});
