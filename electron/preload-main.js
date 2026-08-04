"use strict";

const { contextBridge, ipcRenderer } = require("electron");

function installOwnerRuntime() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const params = new URLSearchParams(window.location.search || "");
  if (params.has("preview")) return;

  const sourceFor = name => window.location.protocol === "file:"
    ? name
    : `/static/${name}`;

  const inject = (name, marker) => new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[${marker}]`);
    if (existing) return resolve();
    const script = document.createElement("script");
    script.setAttribute(marker, "true");
    script.src = sourceFor(name);
    script.addEventListener("load", resolve, { once: true });
    script.addEventListener("error", () => reject(new Error(`${name} failed to load`)), { once: true });
    document.head.appendChild(script);
  });

  const install = async () => {
    const gear = document.getElementById("gear-button");
    if (gear && !gear.getAttribute("aria-label")) gear.setAttribute("aria-label", "Lumi controls");
    try {
      // Owner-finish registers its capture handlers first. The broader runtime
      // follows and supplies selection, speed, update and persistence surfaces.
      await inject("lumi-owner-finish.js", "data-lumi-owner-finish");
      await inject("lumi-runtime-controls.js", "data-lumi-owner-runtime");
    } catch (error) {
      console.error("Lumi owner runtime failed to load", error);
    }
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => void install(), { once: true });
  else void install();
}

installOwnerRuntime();

function positiveNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
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
  const downloadMbps = positiveNumber(result.download_mbps, result.mbps);
  const uploadMbps = positiveNumber(result.upload_mbps);
  const capacityBytesPerSecond = positiveNumber(
    result.capacity_bytes_per_sec,
    result.download_bytes_per_sec,
    positiveNumber(result.capacity_bps, result.bps, result.download_bps) / 8,
    downloadMbps * 125000,
  );
  const uploadBytesPerSecond = positiveNumber(
    result.upload_bytes_per_sec,
    positiveNumber(result.upload_bps) / 8,
    uploadMbps * 125000,
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
    capacity_bytes_per_sec: failed ? 0 : capacityBytesPerSecond,
    upload_bytes_per_sec: failed ? 0 : uploadBytesPerSecond,
    capacity_bps: failed ? 0 : capacityBytesPerSecond * 8,
    upload_bps: failed ? 0 : uploadBytesPerSecond * 8,
    ping_ms: failed ? 0 : positiveNumber(result.ping_ms, result.latency_ms),
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
  getAppInfo: async () => ({
    ...(await ipcRenderer.invoke("ttg-app-info")),
    // Electron sets process.defaultApp when launched through the development
    // runtime. The packaged proof can therefore expose its execution boundary
    // without trusting renderer markup or a test-only flag.
    isPackaged: !process.defaultApp,
  }),
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
