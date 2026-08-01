"""Apply the final readable-source review corrections as one verified commit."""
from __future__ import annotations

import hashlib
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, value: str) -> None:
    (ROOT / path).write_text(value, encoding="utf-8")


def replace_once(value: str, old: str, new: str, *, label: str) -> str:
    count = value.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected one match, found {count}")
    return value.replace(old, new, 1)


def regex_once(value: str, pattern: str, replacement: str, *, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, replacement, value, count=1, flags=flags)
    if count != 1:
        raise RuntimeError(f"{label}: expected one regex match, found {count}")
    return updated


# Workflows: recursive source guard, least-privilege checkouts, explicit Pillow floor,
# and behavioral security coverage in the UI contract lane.
path = ".github/workflows/materialize-readable-source.yml"
value = read(path)
value = replace_once(
    value,
    "      - uses: actions/checkout@v4\n",
    "      - uses: actions/checkout@v4\n        with:\n          persist-credentials: false\n",
    label="readable checkout credentials",
)
value = replace_once(
    value,
    "find electron static -maxdepth 1 -type f -name '*payload*'",
    "find electron static -type f -name '*payload*'",
    label="recursive payload scan",
)
write(path, value)

path = ".github/workflows/lumi-release-gate.yml"
value = read(path)
value = value.replace(
    "      - uses: actions/checkout@v4\n",
    "      - uses: actions/checkout@v4\n        with:\n          persist-credentials: false\n",
)
value = replace_once(
    value,
    "      - name: UI settings speed-test and extension contract\n        run: node tests/lumi-ui-contract.test.js\n",
    "      - name: UI settings speed-test extension and security contracts\n        run: |\n          node tests/lumi-ui-contract.test.js\n          node tests/security-contract.test.js\n",
    label="security contract workflow",
)
value = replace_once(
    value,
    "pip install numpy pillow playwright",
    'pip install numpy "Pillow>=9.1.0" playwright',
    label="Pillow floor",
)
write(path, value)

# Speed-test normalization: skip absent/zero candidates, accept both byte-rate and
# bit-rate contracts, and never let a failed result masquerade as zero Mbps.
write(
    "electron/preload-main.js",
    '''"use strict";

const { contextBridge, ipcRenderer } = require("electron");

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
''',
)

# Main process owns desktop-settings IPC exactly once. Validate renderer-supplied
# directories against the user's home boundary before persisting them.
path = "electron/main.js"
value = read(path)
helper = '''
const DESKTOP_DIRECTORY_KEYS = [
  "defaultDir", "default_dir", "downloadDir", "download_dir",
  "targetDir", "target_dir", "tempDir", "temp_dir",
];

function isInsideRoot(target, root) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function validateDesktopDirectories(value) {
  const next = { ...(value || {}) };
  const home = fs.realpathSync(app.getPath("home"));
  for (const key of DESKTOP_DIRECTORY_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(next, key)) continue;
    const requested = String(next[key] || "").trim();
    if (!requested) {
      next[key] = "";
      continue;
    }
    const resolved = path.resolve(requested);
    if (!fs.existsSync(resolved)) throw new Error(`${key} must reference an existing folder`);
    const target = fs.realpathSync(resolved);
    if (!fs.statSync(target).isDirectory()) throw new Error(`${key} must reference a folder`);
    if (!isInsideRoot(target, home)) throw new Error(`${key} must stay inside the user home folder`);
    next[key] = target;
  }
  return next;
}
'''
value = replace_once(
    value,
    "function writeDesktopPrefs(value) {\n  const next = { ...readDesktopPrefs(), ...(value || {}) };\n  writeJson(desktopPrefsPath(), next);\n  return next;\n}\n",
    "function writeDesktopPrefs(value) {\n  const next = { ...readDesktopPrefs(), ...(value || {}) };\n  writeJson(desktopPrefsPath(), next);\n  return next;\n}\n" + helper,
    label="desktop directory validation helpers",
)
old_handlers = '''  ipcMain.handle("v5-desktop-settings-get", () => ({
    ...readDesktopPrefs(),
    displays: displaysForUi(),
  }));

  ipcMain.handle("v5-desktop-settings-save", (_event, value) => {
    const wasVisible = Boolean(widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible());
    const next = writeDesktopPrefs(value);
    widgetExpanded = false;
    if (next.visible === false || mainWindowIsVisible()) {
      hideWidget();
    } else if (wasVisible) {
      applyWidgetBounds();
      widgetWindow?.showInactive();
    }
    widgetWindow?.webContents.send("v5-settings-changed", next);
    return { ...next, displays: displaysForUi() };
  });
'''
new_handlers = '''  ipcMain.handle("v5-desktop-settings-get", () => ({
    ...readDesktopPrefs(),
    startAtLogin: getStartupEnabled(),
    displays: displaysForUi(),
  }));

  ipcMain.handle("v5-desktop-settings-save", (_event, value) => {
    const wasVisible = Boolean(widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible());
    const requested = value && typeof value === "object" ? value : {};
    if (Object.prototype.hasOwnProperty.call(requested, "startAtLogin")) {
      setStartupEnabled(Boolean(requested.startAtLogin));
    }
    const { startAtLogin: _ignored, ...desktop } = requested;
    const next = writeDesktopPrefs(validateDesktopDirectories(desktop));
    widgetExpanded = false;
    if (next.visible === false || mainWindowIsVisible()) {
      hideWidget();
    } else if (wasVisible) {
      applyWidgetBounds();
      widgetWindow?.showInactive();
    }
    widgetWindow?.webContents.send("v5-settings-changed", next);
    return { ...next, startAtLogin: getStartupEnabled(), displays: displaysForUi() };
  });
'''
value = replace_once(value, old_handlers, new_handlers, label="single desktop settings IPC owner")
write(path, value)

# The release contract exclusively owns safe open/external/extension channels.
write(
    "electron/release-gate-contract.js",
    '''"use strict";

const { app, ipcMain, shell } = require("electron");
const fs = require("fs");
const path = require("path");

const BLOCKED_EXTENSIONS = new Set([
  ".app", ".appx", ".bat", ".chm", ".cmd", ".com", ".cpl", ".desktop",
  ".exe", ".gadget", ".hta", ".inf", ".ins", ".isp", ".jar", ".js",
  ".jse", ".lnk", ".msc", ".msi", ".msix", ".msp", ".mst", ".pif",
  ".ps1", ".pyw", ".reg", ".scr", ".sct", ".sh", ".url", ".vb",
  ".vbe", ".vbs", ".ws", ".wsc", ".wsf", ".wsh",
]);

function desktopPath() {
  return path.join(app.getPath("userData"), "LUMIDM-desktop.json");
}

function readDesktop() {
  try {
    return JSON.parse(fs.readFileSync(desktopPath(), "utf8"));
  } catch (_error) {
    return {};
  }
}

function extensionSource() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "static", "browser-extension", "chromium")
    : path.resolve(__dirname, "..", "static", "browser-extension", "chromium");
}

function allowedRoots() {
  const desktop = readDesktop();
  const configured = [
    desktop.defaultDir,
    desktop.default_dir,
    desktop.downloadDir,
    desktop.download_dir,
    desktop.targetDir,
    desktop.target_dir,
    desktop.tempDir,
    desktop.temp_dir,
  ];
  return [app.getPath("downloads"), app.getPath("documents"), app.getPath("userData"), ...configured]
    .filter(value => typeof value === "string" && value.trim())
    .filter(value => fs.existsSync(value))
    .map(value => fs.realpathSync(path.resolve(value)));
}

function isInsideRoot(target, root) {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function secureOpenTarget(value) {
  const requested = String(value || "").trim();
  if (!requested) throw new Error("No Lumi path was selected");

  const resolved = path.resolve(requested);
  if (!fs.existsSync(resolved)) throw new Error("The selected Lumi path does not exist");
  const target = fs.realpathSync(resolved);
  const stat = fs.statSync(target);
  if (!stat.isFile() && !stat.isDirectory()) {
    throw new Error("Lumi can open only regular files or folders");
  }
  if (!allowedRoots().some(root => isInsideRoot(target, root))) {
    throw new Error("The selected item is outside Lumi's approved folders");
  }
  if (BLOCKED_EXTENSIONS.has(path.extname(target).toLowerCase())) {
    throw new Error("Lumi does not launch executable, script, shortcut, or active-content files");
  }
  return target;
}

function extensionDestination() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(app.getPath("documents"), `Lumi DM Browser Extension ${stamp}`);
}

app.whenReady().then(() => {
  ipcMain.handle("ttg-open-path", async (_event, value) => {
    const target = secureOpenTarget(value);
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
    return { ok: true, path: target };
  });

  ipcMain.handle("ttg-open-external", async (_event, value) => {
    const target = String(value || "").trim();
    if (!/^(https?:|mailto:)/i.test(target)) throw new Error("Unsupported external address");
    await shell.openExternal(target);
    return { ok: true };
  });

  ipcMain.handle("ttg-prepare-browser-extension", async () => {
    const source = extensionSource();
    if (!fs.existsSync(path.join(source, "manifest.json"))) {
      throw new Error("The Lumi Chromium extension package is missing from this build");
    }
    const destination = extensionDestination();
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { recursive: true, errorOnExist: true });
    const error = await shell.openPath(destination);
    if (error) throw new Error(error);
    return { ok: true, path: destination, browsers: ["chrome", "edge"] };
  });
});
''',
)

# Production adapter: one 32-connection fallback, correct bit/byte handling, explicit
# failed-speed state, and polling that never destroys an active settings edit.
path = "static/lumi-approved-integration.js"
value = read(path)
value = replace_once(
    value,
    '  const byteUnits = ["B", "KB", "MB", "GB", "TB"];\n',
    '  const byteUnits = ["B", "KB", "MB", "GB", "TB"];\n  const DEFAULT_CONNECTIONS = 32;\n  const positiveNumber = (...values) => {\n    for (const value of values) {\n      if (value === null || value === undefined || value === "") continue;\n      const parsed = Number(value);\n      if (Number.isFinite(parsed) && parsed > 0) return parsed;\n    }\n    return 0;\n  };\n',
    label="integration numeric helper",
)
value = value.replace("state.settings.default_connections || 16", "state.settings.default_connections || DEFAULT_CONNECTIONS")
value = value.replace("settings.default_connections || 16", "settings.default_connections || DEFAULT_CONNECTIONS")
old_speed = '''      const bps = Number(result?.capacity_bps || result?.bps || result?.download_bps || 0);
      const uploadBps = Number(result?.upload_bps || state.netstats.tx_bps || 0);
      const ping = Number(result?.ping_ms || result?.latency_ms || 0);
      state.speedResult = { bps, uploadBps, ping };
      if (bps) state.netstats.capacity_bps = bps;
      updateStorageChrome();
      toast("Speed test complete", "good");
'''
new_speed = '''      if (result?.ok === false || result?.state === "error" || result?.error) {
        throw new Error(result.error || result.message || "Connection speed test failed");
      }
      const bytesPerSecond = positiveNumber(
        result?.capacity_bytes_per_sec,
        result?.download_bytes_per_sec,
        positiveNumber(result?.capacity_bps, result?.bps, result?.download_bps) / 8,
        positiveNumber(result?.download_mbps, result?.mbps) * 125000,
      );
      if (bytesPerSecond <= 0) throw new Error("Connection speed test returned no usable download result");
      const uploadBytesPerSecond = positiveNumber(
        result?.upload_bytes_per_sec,
        positiveNumber(result?.upload_bps) / 8,
        positiveNumber(result?.upload_mbps) * 125000,
        state.netstats?.tx_bps,
      );
      const ping = positiveNumber(result?.ping_ms, result?.latency_ms);
      state.speedResult = { bps: bytesPerSecond, uploadBps: uploadBytesPerSecond, ping };
      state.netstats ||= { rx_bps: 0, tx_bps: 0, capacity_bps: 0, available: false };
      state.netstats.capacity_bps = bytesPerSecond;
      updateStorageChrome();
      toast("Speed test complete", "good");
'''
value = replace_once(value, old_speed, new_speed, label="integration speed normalization")
value = replace_once(
    value,
    '    window.electronApp?.onConnectionCapacity?.(value => {\n      if (value?.capacity_bps) { state.netstats.capacity_bps = Number(value.capacity_bps); updateStorageChrome(); }\n    });\n',
    '    window.electronApp?.onConnectionCapacity?.(value => {\n      if (value?.ok === false || value?.state === "error" || value?.error) return;\n      const bytesPerSecond = positiveNumber(\n        value?.capacity_bytes_per_sec,\n        value?.download_bytes_per_sec,\n        positiveNumber(value?.capacity_bps, value?.bps, value?.download_bps) / 8,\n      );\n      if (!bytesPerSecond) return;\n      state.netstats ||= { rx_bps: 0, tx_bps: 0, capacity_bps: 0, available: false };\n      state.netstats.capacity_bps = bytesPerSecond;\n      updateStorageChrome();\n    });\n',
    label="capacity event normalization",
)
value = replace_once(
    value,
    '    state.livePollTimer = setInterval(() => { void refreshLive({ full: false, renderAfter: ["overview", "downloads", "unfinished", "finished", "queues"].includes(state.view) }); }, 2200);\n',
    '    state.livePollTimer = setInterval(() => {\n      const editor = document.activeElement;\n      const editingContent = Boolean(\n        editor\n        && editor.closest?.("#content")\n        && ["INPUT", "TEXTAREA", "SELECT"].includes(editor.tagName),\n      );\n      const liveView = ["overview", "downloads", "unfinished", "finished", "queues"].includes(state.view);\n      void refreshLive({ full: false, renderAfter: liveView && !editingContent });\n    }, 2200);\n',
    label="non-destructive live polling",
)
write(path, value)

# Approved renderer: align every fallback to 32, guard disappearing speed nodes and
# tolerate production drive identifiers that are not preview labels.
path = "static/lumi-approved-ui.js"
value = read(path)
value = replace_once(
    value,
    "const fmtGB = mb => mb >= 1024 ? `${(mb/1024).toFixed(mb%1024 ? 1 : 0)} GB` : `${mb.toFixed ? mb.toFixed(1) : mb} MB`;\n",
    "const fmtGB = mb => mb >= 1024 ? `${(mb/1024).toFixed(mb%1024 ? 1 : 0)} GB` : `${mb.toFixed ? mb.toFixed(1) : mb} MB`;\nconst DEFAULT_CONNECTIONS = 32;\n",
    label="renderer default connection constant",
)
value = value.replace("default_connections:16", "default_connections:DEFAULT_CONNECTIONS")
value = value.replace('value="16"', 'value="32"')
value = value.replace("state.settings.default_connections||16", "state.settings.default_connections||DEFAULT_CONNECTIONS")
value = value.replace("state.settings.default_connections || 16", "state.settings.default_connections || DEFAULT_CONNECTIONS")
old_speed_preview = '''function runSpeedTest(){
  state.speedTestRunning=true;openSpeedTest();
  let step=0;const timer=setInterval(()=>{step++;$("#speed-status").innerHTML="● &nbsp;Testing";$("#speed-download").textContent=`${Math.min(82.4,15+step*13.2).toFixed(1)} Mbps`;$("#speed-upload").textContent=`${Math.min(18.6,2+step*3.3).toFixed(1)} Mbps`;$("#speed-ping").textContent=`${Math.max(12,44-step*6)} ms`;if(step>=5){clearInterval(timer);state.speedTestRunning=false;$("#speed-status").innerHTML="● &nbsp;Complete";$("#speed-download").textContent="82.4 Mbps";$("#speed-upload").textContent="18.6 Mbps";$("#speed-ping").textContent="12 ms";const b=$("[data-start-speed-test]");if(b)b.textContent="↻  Test Again";toast("Speed test complete","good")}},350);
}
'''
new_speed_preview = '''function runSpeedTest(){
  state.speedTestRunning=true;openSpeedTest();
  let step=0;const timer=setInterval(()=>{
    const status=$("#speed-status"),download=$("#speed-download"),upload=$("#speed-upload"),ping=$("#speed-ping");
    if(!status||!download||!upload||!ping){clearInterval(timer);state.speedTestRunning=false;return}
    step++;status.textContent="●  Testing";download.textContent=`${Math.min(82.4,15+step*13.2).toFixed(1)} Mbps`;upload.textContent=`${Math.min(18.6,2+step*3.3).toFixed(1)} Mbps`;ping.textContent=`${Math.max(12,44-step*6)} ms`;
    if(step>=5){clearInterval(timer);state.speedTestRunning=false;status.textContent="●  Complete";download.textContent="82.4 Mbps";upload.textContent="18.6 Mbps";ping.textContent="12 ms";const button=$("[data-start-speed-test]");if(button)button.textContent="↻  Test Again";toast("Speed test complete","good")}
  },350);
}
'''
value = replace_once(value, old_speed_preview, new_speed_preview, label="preview speed node guard")
old_drive = '  $("#drive-select").addEventListener("change",e=>{const map={"Drive D:":["248.6 GB","48%"],"Drive C:":["126.9 GB","72%"],"Drive E:":["812.4 GB","19%"]};const [left,pct]=map[e.target.value];$("#storage-left").textContent=left;$("#storage-percent").textContent=pct;toast(`${e.target.value} selected`,`good`)});\n'
new_drive = '  $("#drive-select").addEventListener("change",e=>{const map={"Drive D:":["248.6 GB","48%"],"Drive C:":["126.9 GB","72%"],"Drive E:":["812.4 GB","19%"]};const selected=map[e.target.value];if(!selected){toast(`${e.target.options[e.target.selectedIndex]?.text||"Storage drive"} selected`,`good`);return}const [left,pct]=selected;$("#storage-left").textContent=left;$("#storage-percent").textContent=pct;toast(`${e.target.value} selected`,`good`)});\n'
value = replace_once(value, old_drive, new_drive, label="production drive select guard")
value = value.replace('else if(action==="resume"||action==="retry") task.status="downloading";', 'else if(action==="resume"||action==="retry") task.status="downloading";')
write(path, value)

# CSS keeps desktop calibration while restoring responsive columns after the final
# calibration block. Keyframe naming follows the repository style rules.
path = "static/lumi-approved-ui.css"
value = read(path)
value = value.replace("animation:toastIn .18s ease", "animation:toast-in .18s ease")
value = value.replace("@keyframes toastIn", "@keyframes toast-in")
responsive_restore = '''

/* Responsive restoration after the desktop reference calibration above. */
@media(max-width:1200px){.app-frame{grid-template-columns:260px minmax(0,1fr)}}
@media(max-width:850px){.app-frame{grid-template-columns:minmax(0,1fr)}}
'''
if "Responsive restoration after the desktop reference calibration" not in value:
    value += responsive_restore
write(path, value)

# Release hotfix: finite positive values, bounded fallback HTTP, guarded state/DOM,
# explicit desktop-bridge failure, and useful error fallback text.
path = "static/lumi-release-gate-hotfix.js"
value = read(path)
value = regex_once(
    value,
    r"  function finiteNumber\(\.\.\.values\) \{[\s\S]*?\n  \}\n\n  function formatRate",
    '''  function finiteNumber(...values) {
    for (const value of values) {
      if (value === null || value === undefined || value === "") continue;
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 0;
  }

  function formatRate''',
    label="hotfix finite values",
)
value = replace_once(
    value,
    '    return fetch(path, {\n      method,\n      credentials: "same-origin",\n',
    '    const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"\n      ? AbortSignal.timeout(30_000)\n      : undefined;\n    return fetch(path, {\n      method,\n      credentials: "same-origin",\n      ...(signal ? { signal } : {}),\n',
    label="fallback fetch timeout",
)
value = replace_once(
    value,
    '        pairingPanel = document.createElement("section");\n        pairingPanel.className = "panel";\n        pairingPanel.dataset.releasePairingPanel = "";\n        pairingPanel.style.marginTop = "16px";\n        content.querySelector(".page")?.appendChild(pairingPanel);\n',
    '        const host = content.querySelector(".page");\n        if (!host) return;\n        pairingPanel = document.createElement("section");\n        pairingPanel.className = "panel";\n        pairingPanel.dataset.releasePairingPanel = "";\n        pairingPanel.style.marginTop = "16px";\n        host.appendChild(pairingPanel);\n',
    label="pairing panel host guard",
)
value = replace_once(
    value,
    '      state.speedResult = { bps: bytesPerSecond, uploadBps: uploadBytesPerSecond, ping };\n      state.netstats.capacity_bps = bytesPerSecond;\n',
    '      state.speedResult = { bps: bytesPerSecond, uploadBps: uploadBytesPerSecond, ping };\n      state.netstats ||= { rx_bps: 0, tx_bps: 0, capacity_bps: 0, available: false };\n      state.netstats.capacity_bps = bytesPerSecond;\n',
    label="hotfix netstats guard",
)
value = replace_once(
    value,
    '    replica.state.approvedPrefs = prefs;\n    if (!replica.state.settings?.default_connections) replica.state.settings.default_connections = 32;\n',
    '    replica.state.approvedPrefs = prefs;\n    replica.state.settings ||= {};\n    if (!replica.state.settings.default_connections) replica.state.settings.default_connections = 32;\n',
    label="hotfix settings guard",
)
value = replace_once(
    value,
    '      try {\n        await window.electronApp.prepareBrowserExtension();\n        toast(`${packageButton.dataset.releaseExtensionPackage === "edge" ? "Edge" : "Chrome"} extension package opened`);\n      } catch (error) {\n        toast(error.message, "bad");\n      }\n',
    '      try {\n        if (!window.electronApp?.prepareBrowserExtension) {\n          throw new Error("Browser extension preparation is available only in the Lumi desktop app");\n        }\n        await window.electronApp.prepareBrowserExtension();\n        toast(`${packageButton.dataset.releaseExtensionPackage === "edge" ? "Edge" : "Chrome"} extension package opened`);\n      } catch (error) {\n        toast(error.message || "Browser extension package could not be prepared", "bad");\n      }\n',
    label="extension bridge guard",
)
value = replace_once(
    value,
    '      } catch (error) {\n        toast(error.message, "bad");\n      }\n    }\n  }, true);\n',
    '      } catch (error) {\n        toast(error.message || "Pairing code could not be generated", "bad");\n      }\n    }\n  }, true);\n',
    label="pairing error fallback",
)
write(path, value)

# Widget polling is self-scheduling and suspended while the document is hidden,
# preventing overlapping IPC refresh calls.
path = "electron/widget-approved.html"
value = read(path)
old_widget_tail = '$("#logo-button").onclick=$("#open-main").onclick=()=>bridge.showMain();$("#expand-button").onclick=async()=>{state.expanded=await bridge.toggleExpanded();$("#widget").classList.toggle("expanded",state.expanded)};$("#primary-action").onclick=async e=>{if(e.currentTarget.dataset.id)await bridge.action(e.currentTarget.dataset.action,e.currentTarget.dataset.id);refresh()};$("#task-list").onclick=async e=>{const b=e.target.closest(\'[data-action]\');if(!b)return;await bridge.action(b.dataset.action,b.dataset.id);refresh()};bridge.onExpanded(v=>{$("#widget").classList.toggle("expanded",v)});bridge.onSettings(()=>refresh());bridge.onCapacity(()=>refresh());refresh();setInterval(refresh,1200);\n'
new_widget_tail = '$("#logo-button").onclick=$("#open-main").onclick=()=>bridge.showMain();$("#expand-button").onclick=async()=>{state.expanded=await bridge.toggleExpanded();$("#widget").classList.toggle("expanded",state.expanded)};$("#primary-action").onclick=async e=>{if(e.currentTarget.dataset.id)await bridge.action(e.currentTarget.dataset.action,e.currentTarget.dataset.id);void refresh()};$("#task-list").onclick=async e=>{const b=e.target.closest(\'[data-action]\');if(!b)return;await bridge.action(b.dataset.action,b.dataset.id);void refresh()};bridge.onExpanded(v=>{$("#widget").classList.toggle("expanded",v)});bridge.onSettings(()=>void refresh());bridge.onCapacity(()=>void refresh());let refreshTimer=null;const scheduleRefresh=()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(async()=>{if(!document.hidden)await refresh();scheduleRefresh()},1200)};document.addEventListener("visibilitychange",()=>{if(!document.hidden)void refresh()});void refresh().finally(scheduleRefresh);\n'
value = replace_once(value, old_widget_tail, new_widget_tail, label="widget self-scheduling refresh")
write(path, value)

# CWD-independent UI test plus field-precedence and failure semantics.
write(
    "tests/lumi-ui-contract.test.js",
    '''"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const exists = file => fs.existsSync(path.join(root, file));
const hotfix = read("static/lumi-release-gate-hotfix.js");
const ui = read("static/lumi-approved-ui.js");
const integration = read("static/lumi-approved-integration.js");
const preload = read("electron/preload-main.js");
const contract = read("electron/release-gate-contract.js");
const main = read("electron/main.js");
const server = read("server.py");
const runtime = read("core/v2/runtime.py");
const index = read("static/index.html");

for (const file of [
  "static/lumi-approved-ui.css",
  "static/lumi-approved-ui.js",
  "static/lumi-approved-integration.js",
]) assert(exists(file), `${file} must be readable and committed`);
for (const removed of [
  "static/lumi-approved-loader.js",
  "static/lumi-payload-01.js",
  "electron/main-payload-01.js",
]) assert(!exists(removed), `${removed} must remain removed`);

assert(index.includes('aria-label="Search downloads"'));
assert(index.includes('aria-label="Open settings menu"'));
assert(index.includes('src="lumi-approved-ui.js"'));
assert(index.includes('src="lumi-approved-integration.js"'));
assert(!index.includes("lumi-payload-"));
assert(!main.includes("_compile"));
assert(!main.includes("gunzipSync"));
assert(main.includes('require("./release-gate-contract")'));
assert(!server.includes("set_default_connections"));
assert(runtime.includes('get_setting("default_connections", 32)'));

for (const marker of [
  "data-test-network", "data-start-speed-test", "data-export-settings",
  "data-import-settings", "data-reset-settings", "/api/v4/security/pairing",
  "/api/v4/security/clients", "pairingSecondsRemaining", "schedulePairingExpiry",
]) assert(hotfix.includes(marker), marker);
assert(hotfix.includes("Mozilla Firefox"));
assert(hotfix.includes("Unavailable"));
for (const marker of [
  "BLOCKED_EXTENSIONS", "secureOpenTarget", "The selected item is outside Lumi's approved folders",
  "Lumi does not launch executable, script, shortcut, or active-content files",
  "extensionDestination", "errorOnExist: true",
]) assert(contract.includes(marker), marker);
assert(ui.includes("window.LumiReplica"));
assert(integration.includes("window.LumiProductionIntegration"));

let exposed = null;
let invokeResult = null;
const electron = {
  contextBridge: {
    exposeInMainWorld(name, value) {
      assert.strictEqual(name, "electronApp");
      exposed = value;
    },
  },
  ipcRenderer: {
    invoke: async () => invokeResult,
    send() {}, on() {}, removeListener() {},
  },
};
vm.runInNewContext(preload, {
  require(id) { assert.strictEqual(id, "electron"); return electron; },
  console,
}, { filename: path.join(root, "electron", "preload-main.js") });
assert(exposed, "preload bridge must be exposed");
assert.strictEqual(typeof exposed.prepareBrowserExtension, "function");

(async () => {
  invokeResult = { state: "complete", result: { download_mbps: 80, upload_mbps: 20, latency_ms: 12.4 } };
  const success = await exposed.getConnectionCapacity();
  assert.strictEqual(success.ok, true);
  assert.strictEqual(success.capacity_bytes_per_sec, 10_000_000);
  assert.strictEqual(success.upload_bytes_per_sec, 2_500_000);
  assert.strictEqual(success.capacity_bps, 80_000_000);
  assert.strictEqual(success.upload_bps, 20_000_000);
  assert.strictEqual(success.ping_ms, 12.4);

  invokeResult = { state: "complete", result: { capacity_bytes_per_sec: null, capacity_bps: 80_000_000 } };
  const bitRateFallback = await exposed.getConnectionCapacity();
  assert.strictEqual(bitRateFallback.capacity_bytes_per_sec, 10_000_000);
  assert.strictEqual(bitRateFallback.capacity_bps, 80_000_000);

  invokeResult = { state: "complete", result: { download_bytes_per_sec: 2_000_000, download_bps: 1 } };
  const byteRatePrecedence = await exposed.getConnectionCapacity();
  assert.strictEqual(byteRatePrecedence.capacity_bytes_per_sec, 2_000_000);

  invokeResult = { ok: false, state: "error", error: "timeout", result: { download_mbps: 80 } };
  const failure = await exposed.runConnectionCapacityTest();
  assert.strictEqual(failure.ok, false);
  assert.strictEqual(failure.state, "error");
  assert.strictEqual(failure.error, "timeout");
  assert.strictEqual(failure.capacity_bytes_per_sec, 0);
  assert.strictEqual(failure.capacity_bps, 0);

  invokeResult = { state: "complete", result: { download_mbps: "unknown" } };
  const invalid = await exposed.getConnectionCapacity();
  assert.strictEqual(Number.isNaN(invalid.capacity_bps), false);
  assert.strictEqual(invalid.capacity_bps, 0);

  console.log("Lumi readable UI, settings, speed and extension contract: PASS");
})().catch(error => { console.error(error); process.exit(1); });
''',
)

# Behavioral security and widget-bridge proof used directly by the release gate.
write(
    "tests/security-contract.test.js",
    '''"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-security-"));
const home = path.join(temporary, "home");
const downloads = path.join(home, "Downloads");
const documents = path.join(home, "Documents");
const userData = path.join(home, "AppData");
const outside = path.join(temporary, "outside");
for (const folder of [home, downloads, documents, userData, outside]) fs.mkdirSync(folder, { recursive: true });
const safeFile = path.join(downloads, "safe.txt");
const blockedFile = path.join(downloads, "tool.exe");
const blockedBundle = path.join(downloads, "Unsafe.app");
fs.writeFileSync(safeFile, "safe");
fs.writeFileSync(blockedFile, "blocked");
fs.mkdirSync(blockedBundle);

const handlers = new Map();
let ready = null;
const opened = [];
const electron = {
  app: {
    isPackaged: false,
    whenReady() { return { then(callback) { ready = callback; } }; },
    getPath(name) {
      return { home, downloads, documents, userData }[name] || home;
    },
  },
  ipcMain: { handle(name, callback) { handlers.set(name, callback); } },
  shell: {
    async openPath(value) { opened.push(value); return ""; },
    async openExternal(value) { opened.push(value); },
  },
};
const contract = fs.readFileSync(path.join(root, "electron", "release-gate-contract.js"), "utf8");
vm.runInNewContext(contract, {
  require(id) {
    if (id === "electron") return electron;
    if (id === "fs") return fs;
    if (id === "path") return path;
    throw new Error(`Unexpected require ${id}`);
  },
  __dirname: path.join(root, "electron"),
  process: { ...process, resourcesPath: temporary },
  console,
  Date,
}, { filename: "electron/release-gate-contract.js" });
assert(ready, "release contract must register after Electron readiness");
ready();

async function rejects(promise, pattern) {
  let caught = null;
  try { await promise; } catch (error) { caught = error; }
  assert(caught, "operation should reject");
  assert(pattern.test(String(caught.message || caught)), String(caught));
}

(async () => {
  const open = handlers.get("ttg-open-path");
  assert(open, "secure open handler registered");
  const safe = await open({}, safeFile);
  assert.strictEqual(safe.path, fs.realpathSync(safeFile));
  await rejects(open({}, blockedFile), /does not launch/);
  await rejects(open({}, blockedBundle), /does not launch/);
  await rejects(open({}, outside), /outside Lumi's approved folders/);

  const extension = handlers.get("ttg-prepare-browser-extension");
  assert(extension, "extension preparation handler registered");
  const existing = path.join(documents, "keep-me");
  fs.mkdirSync(existing);
  fs.writeFileSync(path.join(existing, "user.txt"), "preserve");
  const prepared = await extension({});
  assert(fs.existsSync(path.join(existing, "user.txt")), "existing user folder must remain untouched");
  assert(fs.existsSync(path.join(prepared.path, "manifest.json")), "prepared extension must contain its manifest");
  console.log("Secure path and extension preparation contract: PASS");

  const widgetHtml = fs.readFileSync(path.join(root, "electron", "widget-approved.html"), "utf8");
  const script = [...widgetHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
  const nodes = new Map();
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, {
      textContent: "", dataset: {}, style: { setProperty() {} },
      classList: { toggle() {} }, addEventListener() {}, append() {}, replaceChildren() {},
    });
    return nodes.get(selector);
  };
  vm.runInNewContext(script, {
    window: {},
    document: {
      hidden: false,
      querySelector: node,
      createElement() { return node(`created-${nodes.size}`); },
      addEventListener() {},
    },
    console,
    setTimeout() { return 1; },
    clearTimeout() {},
  }, { filename: "electron/widget-approved.html" });
  assert.strictEqual(node("#primary-meta").textContent, "Widget bridge unavailable");
  assert(widgetHtml.includes("replaceChildren"));
  assert(widgetHtml.includes("textContent"));
  console.log("Widget bridge and DOM-safe rendering contract: PASS");
})().finally(() => fs.rmSync(temporary, { recursive: true, force: true })).catch(error => {
  console.error(error);
  process.exit(1);
});
''',
)

# Correct lifecycle assertion count.
path = "tests/lumi-windows-lifecycle.test.js"
value = read(path).replace(
    "Lumi readable Windows lifecycle contract: 32/32 PASS",
    "Lumi readable Windows lifecycle and identity contract: 27/27 PASS",
)
write(path, value)

# Restore test environment at fixture teardown.
path = "tests/test_release_gate_download.py"
value = read(path)
old_fixture = '''@pytest.fixture(scope="module")
def lumi(tmp_path_factory):
    """Start Lumi's real Flask application with isolated persistent directories."""
    root = tmp_path_factory.mktemp("lumi-release-gate")
    os.environ.update(
        LUMIDM_DATA_DIR=str(root / "data"),
        LUMIDM_DOWNLOAD_DIR=str(root / "downloads"),
        LUMIDM_TEMP_DIR=str(root / "temporary"),
    )
    for name in list(sys.modules):
        if name == "server" or name.startswith("core."):
            sys.modules.pop(name, None)

    module = importlib.import_module("server")
    client = module.app.test_client()
    client.environ_base["HTTP_ORIGIN"] = "http://localhost"
    client.environ_base["HTTP_X_LUMI_CLIENT"] = "release-gate-test"
    response = client.get("/api/security/bootstrap")
    assert response.status_code == 200, response.get_data(as_text=True)
    return client, root
'''
new_fixture = '''@pytest.fixture(scope="module")
def lumi(tmp_path_factory):
    """Start Lumi's real Flask application with isolated persistent directories."""
    root = tmp_path_factory.mktemp("lumi-release-gate")
    keys = ("LUMIDM_DATA_DIR", "LUMIDM_DOWNLOAD_DIR", "LUMIDM_TEMP_DIR")
    previous = {key: os.environ.get(key) for key in keys}
    os.environ.update(
        LUMIDM_DATA_DIR=str(root / "data"),
        LUMIDM_DOWNLOAD_DIR=str(root / "downloads"),
        LUMIDM_TEMP_DIR=str(root / "temporary"),
    )
    for name in list(sys.modules):
        if name == "server" or name.startswith("core."):
            sys.modules.pop(name, None)

    module = importlib.import_module("server")
    client = module.app.test_client()
    client.environ_base["HTTP_ORIGIN"] = "http://localhost"
    client.environ_base["HTTP_X_LUMI_CLIENT"] = "release-gate-test"
    response = client.get("/api/security/bootstrap")
    assert response.status_code == 200, response.get_data(as_text=True)
    try:
        yield client, root
    finally:
        runtime = sys.modules.get("core.v2.runtime")
        current = getattr(runtime, "_RUNTIME", None) if runtime else None
        if current is not None:
            current.close()
            runtime._RUNTIME = None
        for key, original in previous.items():
            if original is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = original
'''
value = replace_once(value, old_fixture, new_fixture, label="release test environment restoration")
write(path, value)

path = "tests/test_settings_restart.py"
value = read(path)
value = replace_once(
    value,
    '    os.environ["LUMIDM_DATA_DIR"] = str(data_dir)\n    module = importlib.import_module("server")\n',
    '    module = importlib.import_module("server")\n',
    label="restart helper environment ownership",
)
value = replace_once(
    value,
    'def test_default_connections_survive_restart(tmp_path):\n    """Save 12, restart the application, then observe 12 from the reopened store."""\n    data_dir = tmp_path / "data"\n',
    'def test_default_connections_survive_restart(tmp_path, monkeypatch):\n    """Save 12, restart the application, then observe 12 from the reopened store."""\n    data_dir = tmp_path / "data"\n    monkeypatch.setenv("LUMIDM_DATA_DIR", str(data_dir))\n',
    label="restart monkeypatch",
)
write(path, value)

# Public-internet proof compares Lumi against a reference fetch in the same run and
# retries transient network failures with bounded backoff.
write(
    "tests/windows_public_internet_smoke.py",
    '''"""Windows source smoke test using Lumi's real engine and the public internet."""
from __future__ import annotations

import hashlib
import importlib
import os
from pathlib import Path
import sys
import time
from urllib.request import Request, urlopen

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

PUBLIC_URL = "https://speed.cloudflare.com/__down?bytes=8388608"
EXPECTED_BYTES = 8 * 1024 * 1024
ATTEMPTS = 3


def reference_payload() -> bytes:
    """Fetch the same public object directly with bounded retry/backoff."""
    last_error: Exception | None = None
    for attempt in range(1, ATTEMPTS + 1):
        try:
            request = Request(PUBLIC_URL, headers={"User-Agent": "Lumi-release-gate-reference"})
            with urlopen(request, timeout=45) as response:
                payload = response.read()
            if len(payload) != EXPECTED_BYTES:
                raise RuntimeError(f"reference size was {len(payload)}, expected {EXPECTED_BYTES}")
            return payload
        except Exception as error:  # pragma: no cover - depends on public network
            last_error = error
            if attempt < ATTEMPTS:
                time.sleep(2 ** (attempt - 1))
    raise RuntimeError(f"reference public download failed after {ATTEMPTS} attempts: {last_error}")


def wait_for_task(client, task_id: str, timeout: float = 120) -> dict:
    """Wait for a Lumi task to reach a terminal state."""
    deadline = time.monotonic() + timeout
    result: dict = {}
    while time.monotonic() < deadline:
        status = client.get(f"/api/downloads/{task_id}")
        if status.status_code != 200:
            raise RuntimeError(status.get_data(as_text=True))
        result = status.get_json()
        if result.get("status") in {"completed", "failed", "cancelled", "needs_link"}:
            return result
        time.sleep(0.2)
    raise TimeoutError(f"Lumi public task timed out: {result}")


def main() -> None:
    """Download eight public megabytes through Lumi and compare exact bytes."""
    reference = reference_payload()
    reference_digest = hashlib.sha256(reference).hexdigest()
    root = Path(os.environ.get("RUNNER_TEMP", ".")) / "lumi-public-internet-smoke"
    os.environ.update(
        LUMIDM_DATA_DIR=str(root / "data"),
        LUMIDM_DOWNLOAD_DIR=str(root / "downloads"),
        LUMIDM_TEMP_DIR=str(root / "temporary"),
    )
    module = importlib.import_module("server")
    client = module.app.test_client()
    client.environ_base["HTTP_ORIGIN"] = "http://localhost"
    client.environ_base["HTTP_X_LUMI_CLIENT"] = "windows-public-internet-smoke"
    bootstrap = client.get("/api/security/bootstrap")
    assert bootstrap.status_code == 200, bootstrap.get_data(as_text=True)

    last_error: Exception | None = None
    for attempt in range(1, ATTEMPTS + 1):
        try:
            started_at = time.monotonic()
            response = client.post(
                "/api/downloads/start",
                json={
                    "url": PUBLIC_URL,
                    "target_dir": str(root / "downloads"),
                    "temp_dir": str(root / "temporary"),
                    "filename": f"cloudflare-public-smoke-{attempt}.bin",
                    "connections": 32,
                    "duplicate_policy": "overwrite",
                },
            )
            assert response.status_code == 200, response.get_data(as_text=True)
            task = response.get_json()
            assert task["connections"] == 32
            result = wait_for_task(client, task["id"])
            if result.get("status") != "completed":
                raise RuntimeError(f"Lumi public task failed: {result}")
            final_path = Path(result["final_path"])
            payload = final_path.read_bytes()
            if len(payload) != EXPECTED_BYTES:
                raise RuntimeError(f"Lumi size was {len(payload)}, expected {EXPECTED_BYTES}")
            digest = hashlib.sha256(payload).hexdigest()
            if digest != reference_digest or payload != reference:
                raise RuntimeError({"reference_sha256": reference_digest, "lumi_sha256": digest})
            elapsed = time.monotonic() - started_at
            throughput_mbps = EXPECTED_BYTES * 8 / elapsed / 1_000_000
            print({
                "source": PUBLIC_URL,
                "bytes": EXPECTED_BYTES,
                "sha256": digest,
                "seconds": round(elapsed, 3),
                "observed_mbps": round(throughput_mbps, 2),
                "mode": result.get("mode"),
                "connections": result.get("connections"),
                "attempt": attempt,
            })
            return
        except Exception as error:  # pragma: no cover - depends on public network
            last_error = error
            if attempt < ATTEMPTS:
                time.sleep(2 ** (attempt - 1))
    raise RuntimeError(f"Lumi public smoke failed after {ATTEMPTS} attempts: {last_error}")


if __name__ == "__main__":
    main()
''',
)

# Strengthen the aggregate test with behavioral security/lifecycle execution and
# update readable source hashes after the reviewed corrections.
path = "tests/sergeant-20-for-2.test.js"
value = read(path)
value = replace_once(
    value,
    'const crypto = require("crypto");\nconst fs = require("fs");\n',
    'const crypto = require("crypto");\nconst fs = require("fs");\nconst path = require("path");\nconst vm = require("vm");\nconst { execFileSync } = require("child_process");\n',
    label="Sergeant behavioral imports",
)
value = replace_once(
    value,
    'const readableWorkflow = read(".github/workflows/materialize-readable-source.yml");\n',
    'const readableWorkflow = read(".github/workflows/materialize-readable-source.yml");\nconst securityEvidence = execFileSync(process.execPath, [path.join(__dirname, "security-contract.test.js")], { encoding: "utf8" });\nconst lifecycleEvidence = execFileSync(process.execPath, [path.join(__dirname, "lumi-windows-lifecycle.test.js")], { encoding: "utf8" });\n',
    label="Sergeant behavioral evidence",
)
value = regex_once(
    value,
    r'lane\("A", 14, "Readable Electron runtime", \(\) => \{[\s\S]*?\n\}\);',
    'lane("A", 14, "Readable Electron runtime", () => { new vm.Script(main); assert(!main.includes("Module._compile")); assert(!main.includes("gunzipSync")); assert(!exists("electron/main-payload-01.js")); });',
    label="Sergeant readable runtime behavior",
)
value = regex_once(
    value,
    r'lane\("A", 15, "Tray and widget lifecycle", \(\) => \{[\s\S]*?\n\}\);',
    'lane("A", 15, "Tray and widget lifecycle", () => assert(lifecycleEvidence.includes("27/27 PASS")));',
    label="Sergeant lifecycle behavior",
)
value = regex_once(
    value,
    r'lane\("A", 16, "Canonical Lumi identity", \(\) => \{[\s\S]*?\n\}\);',
    'lane("A", 16, "Canonical Lumi identity", () => assert(lifecycleEvidence.includes("identity contract")));',
    label="Sergeant identity behavior",
)
value = regex_once(
    value,
    r'lane\("A", 17, "Secure path opening", \(\) => \{[\s\S]*?\n\}\);',
    'lane("A", 17, "Secure path opening", () => assert(securityEvidence.includes("Secure path and extension preparation contract: PASS")));',
    label="Sergeant secure path behavior",
)
value = regex_once(
    value,
    r'lane\("B", 6, "Widget bridge guard", \(\) => assert\(widget\.includes\("if\(!bridge\)"\)\)\);',
    'lane("B", 6, "Widget bridge guard", () => assert(securityEvidence.includes("Widget bridge and DOM-safe rendering contract: PASS")));',
    label="Sergeant widget behavior",
)
value = regex_once(
    value,
    r'lane\("B", 7, "Widget DOM-safe task rows", \(\) => \{[\s\S]*?\n\}\);',
    'lane("B", 7, "Widget DOM-safe task rows", () => assert(securityEvidence.includes("DOM-safe rendering contract: PASS")));',
    label="Sergeant DOM behavior",
)
value = regex_once(
    value,
    r'lane\("B", 15, "No destructive extension cleanup", \(\) => assert\(!contract\.includes\("rmSync\(destination"\)\)\);',
    'lane("B", 15, "No destructive extension cleanup", () => assert(securityEvidence.includes("extension preparation contract: PASS")));',
    label="Sergeant extension behavior",
)
value = regex_once(
    value,
    r'lane\("B", 16, "Executable deny-list", \(\) => \{[\s\S]*?\n\}\);',
    'lane("B", 16, "Executable deny-list", () => assert(securityEvidence.includes("Secure path")));',
    label="Sergeant deny-list behavior",
)
css_hash = hashlib.sha256(read("static/lumi-approved-ui.css").encode()).hexdigest()
ui_hash = hashlib.sha256(read("static/lumi-approved-ui.js").encode()).hexdigest()
value = re.sub(
    r'(hash\("static/lumi-approved-ui\.css"\), ")[0-9a-f]{64}("\)\))',
    rf'\g<1>{css_hash}\g<2>',
    value,
    count=1,
)
value = re.sub(
    r'(hash\("static/lumi-approved-ui\.js"\), ")[0-9a-f]{64}("\)\))',
    rf'\g<1>{ui_hash}\g<2>',
    value,
    count=1,
)
write(path, value)

# The one-shot workflow and script remove themselves from the resulting commit.
(ROOT / "scripts" / "apply_final_review_fixes.py").unlink()
(ROOT / ".github" / "workflows" / "apply-final-review-fixes.yml").unlink()
print("Final CodeRabbit corrections applied")
