"use strict";

const { contextBridge, ipcRenderer } = require("electron");

function finiteNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }
  return 0;
}

function normalizedCapacity(value) {
  const outer = value && typeof value === "object" ? value : {};
  const result = outer.result && typeof outer.result === "object" ? outer.result : outer;
  const failed = (
    outer.ok === false
    || result.ok === false
    || outer.state === "error"
    || result.state === "error"
    || Boolean(outer.error || result.error)
  );
  const downloadMbps = finiteNumber(result.download_mbps, result.mbps);
  const uploadMbps = finiteNumber(result.upload_mbps);
  const capacityBytesPerSecond = finiteNumber(
    result.capacity_bytes_per_sec,
    result.download_bytes_per_sec,
    downloadMbps > 0 ? downloadMbps * 125000 : 0,
  );
  const uploadBytesPerSecond = finiteNumber(
    result.upload_bytes_per_sec,
    uploadMbps > 0 ? uploadMbps * 125000 : 0,
  );
  const error = failed
    ? String(outer.error || result.error || outer.message || result.message || "Connection test failed")
    : "";
  return {
    ...outer,
    ...result,
    ok: !failed,
    state: failed ? "error" : (result.state || outer.state || (capacityBytesPerSecond ? "complete" : "idle")),
    error,
    capacity_bytes_per_sec: capacityBytesPerSecond,
    upload_bytes_per_sec: uploadBytesPerSecond,
    capacity_bps: capacityBytesPerSecond * 8,
    upload_bps: uploadBytesPerSecond * 8,
    ping_ms: finiteNumber(result.ping_ms, result.latency_ms),
  };
}

contextBridge.exposeInMainWorld("electronApp", {
  pickFolder: () => ipcRenderer.invoke("pick-folder"),
  openPath: value => ipcRenderer.invoke("ttg-open-path", value),
  openExternal: value => ipcRenderer.invoke("ttg-open-external", value),
  prepareBrowserExtension: () => ipcRenderer.invoke("ttg-prepare-browser-extension"),
  isElectron: true,
  getDesktopSettings: () => ipcRenderer.invoke("v5-desktop-settings-get"),
  saveDesktopSettings: value => ipcRenderer.invoke("v5-desktop-settings-save", value),
  showWidget: () => ipcRenderer.send("v5-widget-show"),
  checkForUpdates: (manual = false) => ipcRenderer.invoke("v5-update-check", manual),
  getConnectionCapacity: async () => normalizedCapacity(await ipcRenderer.invoke("v6-capacity-status")),
  runConnectionCapacityTest: async () => normalizedCapacity(await ipcRenderer.invoke("v6-capacity-run")),
  windowControl: action => ipcRenderer.invoke("ttg-window-control", action),
  getWindowState: () => ipcRenderer.invoke("ttg-window-state"),
  getAppInfo: () => ipcRenderer.invoke("ttg-app-info"),
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
    const listener = (_event, value) => callback(normalizedCapacity(value));
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
