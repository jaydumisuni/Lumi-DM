"use strict";

const { app, BrowserWindow, ipcMain, screen, shell } = require("electron");
const fs = require("fs");
const path = require("path");

const LOGIN_ARGS = ["--hidden", "--login-startup"];
const BLOCKED_EXTENSIONS = new Set([
  ".app", ".bat", ".cmd", ".com", ".cpl", ".exe", ".gadget", ".hta",
  ".inf", ".ins", ".isp", ".jar", ".js", ".jse", ".lnk", ".msc",
  ".msi", ".msp", ".mst", ".pif", ".ps1", ".reg", ".scr", ".sct",
  ".sh", ".url", ".vb", ".vbe", ".vbs", ".ws", ".wsc", ".wsf", ".wsh",
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

function writeDesktop(value) {
  const next = { ...readDesktop(), ...(value || {}) };
  fs.mkdirSync(path.dirname(desktopPath()), { recursive: true });
  const temporary = `${desktopPath()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(next, null, 2));
  fs.renameSync(temporary, desktopPath());
  return next;
}

function getStartup() {
  if (process.platform === "win32") {
    const value = app.getLoginItemSettings({ path: process.execPath, args: LOGIN_ARGS });
    return Boolean(value.openAtLogin && value.enabled !== false);
  }
  return Boolean(app.getLoginItemSettings().openAtLogin);
}

function setStartup(enabled) {
  if (process.platform === "win32") {
    app.setLoginItemSettings({
      path: process.execPath,
      args: LOGIN_ARGS,
      openAtLogin: Boolean(enabled),
    });
    return;
  }
  app.setLoginItemSettings({
    openAtLogin: Boolean(enabled),
    openAsHidden: true,
    args: ["--hidden"],
  });
}

function displays() {
  const primary = screen.getPrimaryDisplay();
  return screen.getAllDisplays().map((display, index) => ({
    id: String(display.id),
    label: `${display.id === primary.id ? "Primary" : `Display ${index + 1}`} · ${display.workArea.width}×${display.workArea.height}`,
  }));
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
    .map(value => path.resolve(value));
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

  // Opening a directory only reveals it in the platform file manager; it does not
  // execute a file. Files require both an approved root and a non-executable type.
  if (stat.isDirectory()) return target;
  if (!stat.isFile()) throw new Error("Lumi can open only regular files or folders");
  if (!allowedRoots().some(root => isInsideRoot(target, root))) {
    throw new Error("The selected file is outside Lumi's approved folders");
  }
  if (BLOCKED_EXTENSIONS.has(path.extname(target).toLowerCase())) {
    throw new Error("Lumi does not launch executable or script files");
  }
  return target;
}

function extensionDestination() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(app.getPath("documents"), `Lumi DM Browser Extension ${stamp}`);
}

app.whenReady().then(() => {
  for (const name of [
    "ttg-open-path",
    "ttg-open-external",
    "ttg-prepare-browser-extension",
    "v5-desktop-settings-get",
    "v5-desktop-settings-save",
  ]) {
    try {
      ipcMain.removeHandler(name);
    } catch (_error) {
      // Handler was not registered by the base runtime.
    }
  }

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

  ipcMain.handle("v5-desktop-settings-get", () => ({
    ...readDesktop(),
    startAtLogin: getStartup(),
    displays: displays(),
  }));

  ipcMain.handle("v5-desktop-settings-save", (_event, value) => {
    if (value && Object.prototype.hasOwnProperty.call(value, "startAtLogin")) {
      setStartup(value.startAtLogin);
    }
    const { startAtLogin: _ignored, ...desktop } = value || {};
    const next = writeDesktop(desktop);
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send("v5-settings-changed", next);
    }
    return { ...next, startAtLogin: getStartup(), displays: displays() };
  });
});
