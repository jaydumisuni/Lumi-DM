"use strict";

const { app, ipcMain, shell } = require("electron");
const fs = require("fs");
const path = require("path");

const BLOCKED_EXTENSIONS = new Set([
  ".app", ".appx", ".application", ".bat", ".chm", ".cmd", ".com", ".command",
  ".cpl", ".desktop", ".exe", ".gadget", ".hta", ".inf", ".ins", ".isp",
  ".jar", ".jnlp", ".js", ".jse", ".lnk", ".lua", ".msc", ".msi",
  ".msix", ".msp", ".mst", ".msu", ".php", ".pif", ".pl", ".ps1",
  ".py", ".pyc", ".pyw", ".rb", ".reg", ".scf", ".scr", ".sct", ".sh",
  ".terminal", ".url", ".vb", ".vbe", ".vbs", ".workflow", ".ws", ".wsc",
  ".wsf", ".wsh",
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
  return { target, isFile: stat.isFile() };
}

function extensionDestination() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(app.getPath("documents"), `Lumi DM Browser Extension ${stamp}`);
}

app.whenReady().then(() => {
  ipcMain.handle("ttg-open-path", async (_event, value) => {
    const { target, isFile } = secureOpenTarget(value);
    if (isFile) {
      shell.showItemInFolder(target);
      return { ok: true, path: target, revealed: true };
    }
    const error = await shell.openPath(target);
    if (error) throw new Error(error);
    return { ok: true, path: target, revealed: false };
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
