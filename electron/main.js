"use strict";

const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  Notification,
  dialog,
  ipcMain,
  nativeImage,
  screen,
  shell,
} = require("electron");
const fs = require("fs");
const http = require("http");
const path = require("path");

app.setName("Lumi DM");
if (process.platform === "win32") app.setAppUserModelId("com.lumi.dm");

if (app.isPackaged) process.env.LUMIDM_BRANDING_DIR = path.join(process.resourcesPath, "Resouces");
else process.env.LUMIDM_BRANDING_DIR = path.resolve(__dirname, "..", "Resouces");

// Native geometry/file-shell policy and loopback Runtime auth are explicit.
// The legacy cookie-bootstrap shim is intentionally not loaded here: Electron
// owns a per-process secret for native Runtime calls, while the renderer owns
// its normal HttpOnly browser session.
require("./window-contract");
require("./runtime-http-auth");
const serverSupervisor = require("./server-supervisor");
require("./connection-capacity");
require("./desktop-command-poller");
const { UpdateManager } = require("./update-manager");

const API_HOST = "127.0.0.1";
const API_PORT = 7000;
const API_ORIGIN = `http://${API_HOST}:${API_PORT}`;
const LOGIN_ARGS = ["--hidden", "--login-startup"];
const LEGACY_LOGIN_ARGS = ["--hidden"];
const ACTIVE_STATES = new Set(["queued", "resolving", "running", "pausing", "post_processing"]);

let mainWindow = null;
let widgetWindow = null;
let tray = null;
let updater = null;
let isQuitting = false;
let pollingTimer = null;
let baselineReady = false;
let lastSpeed = 0;
let lastActive = 0;
const taskBaseline = new Map();

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();

function isHiddenLaunch(argv = process.argv) {
  return argv.includes("--hidden") || argv.includes("--login-startup");
}

function isStartupLaunch(argv = process.argv) {
  if (process.platform === "win32") return isHiddenLaunch(argv);
  const settings = app.getLoginItemSettings();
  return settings.wasOpenedAtLogin || settings.wasOpenedAsHidden || isHiddenLaunch(argv);
}

function getLoginOptions(args = LOGIN_ARGS) { return { path: process.execPath, args }; }

function getStartupEnabled() {
  if (process.platform === "linux") return readGeneralPrefs().startAtLogin === true;
  if (process.platform === "win32") {
    const current = app.getLoginItemSettings(getLoginOptions());
    if (current.openAtLogin) return current.enabled !== false;
    const legacy = app.getLoginItemSettings(getLoginOptions(LEGACY_LOGIN_ARGS));
    return legacy.openAtLogin && legacy.enabled !== false;
  }
  return app.getLoginItemSettings().openAtLogin;
}

function setStartupEnabled(enabled) {
  if (process.platform === "linux") writeGeneralPrefs({ ...readGeneralPrefs(), startAtLogin: enabled });
  else if (process.platform === "win32") {
    app.setLoginItemSettings({ ...getLoginOptions(LEGACY_LOGIN_ARGS), openAtLogin: false });
    app.setLoginItemSettings({ ...getLoginOptions(), openAtLogin: enabled });
  } else app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: true, args: ["--hidden"] });
  rebuildTrayMenu();
}

function iconPath() {
  if (process.platform === "win32") {
    return app.isPackaged
      ? path.join(process.resourcesPath, "assets", "windows", "Lumi-DM.ico")
      : path.resolve(__dirname, "..", "assets", "windows", "Lumi-DM.ico");
  }
  return app.isPackaged
    ? path.join(process.resourcesPath, "static", "favicon-256.png")
    : path.resolve(__dirname, "..", "static", "favicon-256.png");
}

function generalPrefsPath() { return path.join(app.getPath("userData"), "LUMIDM-prefs.json"); }
function desktopPrefsPath() { return path.join(app.getPath("userData"), "LUMIDM-desktop.json"); }
function readJson(file, fallback) {
  try { return { ...fallback, ...JSON.parse(fs.readFileSync(file, "utf8")) }; }
  catch (_) { return { ...fallback }; }
}
function writeJson(file, value) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), "utf8");
    fs.renameSync(temporary, file);
  } catch (_) {}
}
function readGeneralPrefs() { return readJson(generalPrefsPath(), {}); }
function writeGeneralPrefs(value) { writeJson(generalPrefsPath(), value); }
function defaultDesktopPrefs() {
  return { corner: "bottom-right", displayId: "primary", margin: 12, scale: 1, visible: true, showUpload: false };
}
function readDesktopPrefs() { return readJson(desktopPrefsPath(), defaultDesktopPrefs()); }
function writeDesktopPrefs(value) {
  const next = { ...readDesktopPrefs(), ...(value || {}) };
  writeJson(desktopPrefsPath(), next);
  return next;
}

function displayFor(settings) {
  if (String(settings.displayId) === "primary") return screen.getPrimaryDisplay();
  return screen.getAllDisplays().find(display => String(display.id) === String(settings.displayId)) || screen.getPrimaryDisplay();
}
function displaysForUi() {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((display, index) => ({
    id: String(display.id),
    label: `${display.id === primary.id ? "Primary" : `Display ${index + 1}`} · ${display.workArea.width}×${display.workArea.height}`,
  }));
}
function cornerBounds(width, height, settings = readDesktopPrefs()) {
  const area = displayFor(settings).workArea;
  const margin = Math.max(4, Math.min(80, Number(settings.margin || 12)));
  const left = String(settings.corner).endsWith("left");
  const top = String(settings.corner).startsWith("top");
  return {
    x: Math.round(left ? area.x + margin : area.x + area.width - width - margin),
    y: Math.round(top ? area.y + margin : area.y + area.height - height - margin),
    width,
    height,
  };
}

function requestJson(method, route, body = null, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const payload = body === null ? null : Buffer.from(JSON.stringify(body));
    const request = http.request({
      hostname: API_HOST,
      port: API_PORT,
      path: route,
      method,
      timeout,
      headers: {
        "X-Lumi-Client": "electron-desktop",
        ...(payload ? { "Content-Type": "application/json", "Content-Length": payload.length } : {}),
      },
    }, response => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", chunk => { raw += chunk; });
      response.on("end", () => {
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; }
        catch (_) { data = { error: raw.slice(0, 300) }; }
        if ((response.statusCode || 500) >= 400) {
          reject(new Error(data.error || `Lumi API ${response.statusCode}`));
          return;
        }
        resolve(data);
      });
    });
    request.on("timeout", () => request.destroy(new Error("Lumi Runtime timed out")));
    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}

async function waitForServer(timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await serverSupervisor.checkReady(1500)) return true;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  return false;
}

function runtimeErrorPath() {
  return path.join(__dirname, "runtime-error.html");
}

async function loadOwnedRuntime(window) {
  const ready = await waitForServer();
  if (!window || window.isDestroyed()) return false;
  if (ready) {
    await window.loadURL(API_ORIGIN);
    return true;
  }
  await window.loadFile(runtimeErrorPath());
  return false;
}

function createMainWindow(startHidden = false) {
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  mainWindow = new BrowserWindow({
    width: 920,
    height: 650,
    minWidth: 720,
    minHeight: 500,
    center: true,
    show: false,
    frame: false,
    title: "Lumi DM",
    icon: iconPath(),
    autoHideMenuBar: true,
    backgroundColor: "#070a11",
    webPreferences: { contextIsolation: true, preload: path.join(__dirname, "preload-main.js") },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("close", event => {
    if (isQuitting) return;
    event.preventDefault();
    mainWindow.hide();
    showWidget();
  });
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.on("maximize", broadcastWindowState);
  mainWindow.on("unmaximize", broadcastWindowState);
  mainWindow.on("focus", broadcastWindowState);
  mainWindow.on("blur", broadcastWindowState);

  void (async () => {
    await loadOwnedRuntime(mainWindow);
    if (!startHidden && mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  })();
  return mainWindow;
}
function showMainWindow() {
  const window = createMainWindow(false);
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
}
function broadcastWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("ttg-window-state-changed", {
    maximized: mainWindow.isMaximized(),
    focused: mainWindow.isFocused(),
  });
}

function initialWidgetBounds(settings = readDesktopPrefs()) {
  const scale = Math.max(0.75, Math.min(1.35, Number(settings.scale || 1)));
  return cornerBounds(Math.round(240 * scale), Math.round(66 * scale), settings);
}
function repositionWidgetPreservingSize(settings = readDesktopPrefs()) {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const bounds = widgetWindow.getBounds();
  const area = displayFor(settings).workArea;
  const margin = Math.max(4, Math.min(80, Number(settings.margin || 12)));
  const left = String(settings.corner).endsWith("left");
  const top = String(settings.corner).startsWith("top");
  widgetWindow.setBounds({
    x: Math.round(left ? area.x + margin : area.x + area.width - bounds.width - margin),
    y: Math.round(top ? area.y + margin : area.y + area.height - bounds.height - margin),
    width: bounds.width,
    height: bounds.height,
  }, true);
}
function createWidget() {
  const settings = readDesktopPrefs();
  if (widgetWindow && !widgetWindow.isDestroyed()) return widgetWindow;
  widgetWindow = new BrowserWindow({
    ...initialWidgetBounds(settings),
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    show: false,
    alwaysOnTop: true,
    webPreferences: { contextIsolation: true, preload: path.join(__dirname, "preload-widget.js") },
  });
  widgetWindow.setAlwaysOnTop(true, "floating");
  widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
  void widgetWindow.loadFile(path.join(__dirname, "widget.html"));
  widgetWindow.on("closed", () => { widgetWindow = null; });
  widgetWindow.once("ready-to-show", () => {
    if (settings.visible !== false) widgetWindow.showInactive();
  });
  return widgetWindow;
}
function showWidget() {
  const settings = readDesktopPrefs();
  if (settings.visible === false) return;
  createWidget();
  repositionWidgetPreservingSize(settings);
  widgetWindow.showInactive();
}
function hideWidget() {
  if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.hide();
}

function formatSpeed(value) {
  const bytes = Number(value || 0);
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB/s`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB/s`;
  return `${bytes.toFixed(0)} B/s`;
}
function notifyCompletion(task) {
  if (!Notification.isSupported()) return;
  const notification = new Notification({
    title: "Download complete",
    body: task.filename || "File downloaded",
    icon: iconPath(),
    silent: false,
  });
  notification.on("click", () => {
    void requestJson("POST", `/api/downloads/${encodeURIComponent(task.id)}/open`, {}).catch(() => {});
    showMainWindow();
  });
  notification.show();
}
async function pollTasks() {
  try {
    const result = await requestJson("GET", "/api/downloads?limit=200", null, 5000);
    const downloads = result.downloads || [];
    lastActive = downloads.filter(task => task.status === "running").length;
    lastSpeed = downloads.reduce((sum, task) => sum + Number(task.speed_bytes_per_sec || 0), 0);
    if (tray) tray.setToolTip(lastActive ? `Lumi DM · ↓ ${formatSpeed(lastSpeed)} · ${lastActive} active` : "Lumi DM");
    if (!baselineReady) {
      for (const task of downloads) taskBaseline.set(String(task.id), String(task.status || ""));
      baselineReady = true;
    } else {
      const liveIds = new Set();
      for (const task of downloads) {
        const id = String(task.id);
        const status = String(task.status || "");
        const previous = taskBaseline.get(id);
        liveIds.add(id);
        if (status === "completed" && previous && ACTIVE_STATES.has(previous)) notifyCompletion(task);
        taskBaseline.set(id, status);
      }
      for (const id of taskBaseline.keys()) if (!liveIds.has(id)) taskBaseline.delete(id);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      const running = downloads.filter(task => task.status === "running");
      if (running.length) {
        const average = running.reduce((sum, task) => sum + Number(task.progress_percent || 0), 0) / running.length;
        mainWindow.setProgressBar(average / 100);
      } else mainWindow.setProgressBar(-1);
    }
  } catch (_) {}
}

function rebuildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Lumi DM", enabled: false },
    { type: "separator" },
    { label: "Open Lumi Manager", click: showMainWindow },
    { label: "Show connection widget", click: showWidget },
    { type: "separator" },
    {
      label: "Run at Windows startup",
      type: "checkbox",
      checked: getStartupEnabled(),
      click: item => setStartupEnabled(item.checked),
    },
    { type: "separator" },
    { label: "Quit", click: () => { isQuitting = true; app.quit(); } },
  ]));
}
function createTray() {
  const image = nativeImage.createFromPath(iconPath());
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip("Lumi DM");
  tray.on("click", showWidget);
  tray.on("double-click", showMainWindow);
  rebuildTrayMenu();
}

function registerIpc() {
  ipcMain.handle("pick-folder", async event => {
    const owner = BrowserWindow.fromWebContents(event.sender) || mainWindow || BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(owner, {
      title: "Choose download folder",
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle("ttg-window-control", (event, action) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window || window.isDestroyed()) return { ok: false, maximized: false };
    if (action === "minimize") window.minimize();
    if (action === "maximize") window.isMaximized() ? window.unmaximize() : window.maximize();
    if (action === "close") window.close();
    return { ok: true, maximized: window.isMaximized() };
  });
  ipcMain.handle("ttg-window-state", event => {
    const window = BrowserWindow.fromWebContents(event.sender);
    return {
      maximized: Boolean(window && !window.isDestroyed() && window.isMaximized()),
      focused: Boolean(window && !window.isDestroyed() && window.isFocused()),
    };
  });
  ipcMain.handle("ttg-app-info", () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    architecture: process.arch,
    publisher: "THETECHGUY DIGITAL SOLUTIONS",
    website: "https://thetechguyds.com/tools",
  }));

  ipcMain.handle("v5-desktop-settings-get", () => ({ ...readDesktopPrefs(), displays: displaysForUi() }));
  ipcMain.handle("v5-desktop-settings-save", (_event, value) => {
    const next = writeDesktopPrefs(value);
    if (next.visible === false) hideWidget();
    else {
      createWidget();
      repositionWidgetPreservingSize(next);
      widgetWindow?.showInactive();
    }
    widgetWindow?.webContents.send("v5-settings-changed", next);
    return { ...next, displays: displaysForUi() };
  });
  ipcMain.on("v5-widget-show", showWidget);
  ipcMain.on("v5-widget-show-main", showMainWindow);
}

app.on("second-instance", (_event, argv) => { if (!isHiddenLaunch(argv)) showMainWindow(); });
app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;
  Menu.setApplicationMenu(null);
  registerIpc();
  createTray();
  serverSupervisor.start();
  createMainWindow(isStartupLaunch());
  createWidget();
  showWidget();
  updater = new UpdateManager({
    onStatus: status => {
      for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send("v5-update-status", status);
      }
    },
  });
  ipcMain.handle("v5-update-check", (_event, manual) => updater.check(Boolean(manual)));
  void updater.check(false);
  pollingTimer = setInterval(() => void pollTasks(), 1800);
  void pollTasks();
});
app.on("before-quit", () => {
  isQuitting = true;
  if (pollingTimer) clearInterval(pollingTimer);
  if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.destroy();
  serverSupervisor.stop();
});
app.on("window-all-closed", () => {});
app.on("activate", showMainWindow);
