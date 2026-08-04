import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { _electron: electron } = require("playwright");

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const executable = path.resolve(String(process.env.LUMI_PACKAGED_EXE || ""));

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch (_) {
    return false;
  }
}

assert.ok(process.env.LUMI_PACKAGED_EXE, "LUMI_PACKAGED_EXE is required");
assert.ok(isFile(executable), `packaged Lumi executable missing: ${executable}`);

const isolated = fs.mkdtempSync(path.join(os.tmpdir(), "lumi-packaged-proof-"));
const userData = path.join(isolated, "user-data");
const userProfile = path.join(isolated, "profile");
fs.mkdirSync(userData, { recursive: true });
fs.mkdirSync(userProfile, { recursive: true });

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

async function waitFor(predicate, message, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 160));
  }
  throw new Error(message);
}

let app;
let preparedPath = "";
try {
  app = await electron.launch({
    executablePath: executable,
    args: [`--user-data-dir=${userData}`],
    env: {
      ...process.env,
      USERPROFILE: userProfile,
      HOME: userProfile,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      LUMIDM_PROOF_PACKAGED: "1",
    },
    timeout: 180_000,
  });

  const page = await app.firstWindow({ timeout: 180_000 });
  await page.waitForURL(/^http:\/\/127\.0\.0\.1:7000\/?$/, { timeout: 180_000 });
  await page.waitForFunction(() => Boolean(window.LumiReplica?.state && window.electronApp?.isElectron), null, { timeout: 90_000 });

  const packaged = await app.evaluate(({ app: electronApp, BrowserWindow, nativeImage }) => {
    const resources = process.resourcesPath;
    const separator = process.platform === "win32" ? "\\" : "/";
    const iconPath = [resources, "static", "favicon-256.png"].join(separator);
    const image = nativeImage.createFromPath(iconPath);
    const windows = BrowserWindow.getAllWindows().filter(window => !window.isDestroyed());
    return {
      isPackaged: electronApp.isPackaged,
      appPath: electronApp.getAppPath(),
      resources,
      appVersion: electronApp.getVersion(),
      iconEmpty: image.isEmpty(),
      iconSize: image.getSize(),
      windows: windows.map(window => ({
        id: window.id,
        visible: window.isVisible(),
        alwaysOnTop: window.isAlwaysOnTop(),
        bounds: window.getBounds(),
        url: window.webContents.getURL(),
      })),
    };
  });
  assert.equal(packaged.isPackaged, true, "proof launched development Electron instead of the packaged application");
  assert.match(packaged.appPath, /app\.asar$/i, "packaged source must execute from app.asar");
  assert.equal(packaged.iconEmpty, false, "packaged canonical icon could not be decoded");
  assert.deepEqual(packaged.iconSize, { width: 256, height: 256 });

  const resources = packaged.resources;
  const required = [
    path.join(resources, "static", "index.html"),
    path.join(resources, "static", "favicon-256.png"),
    path.join(resources, "Resouces", "download manager logo.png"),
    path.join(resources, "browser-extension", "manifest.json"),
    path.join(resources, "browser-extension", "media-quality-picker.js"),
    path.join(resources, "browser-extension", "media-quality-bridge.js"),
    path.join(resources, "server", "LUMIDM-server.exe"),
  ];
  for (const file of required) assert.ok(isFile(file), `packaged resource missing: ${file}`);
  assert.equal(fs.existsSync(path.join(resources, "static", "browser-extension", "chromium")), false,
    "packaged app contains the removed duplicate extension");

  assert.equal(sha256(path.join(resources, "static", "favicon-256.png")), sha256(path.join(root, "static", "favicon-256.png")),
    "packaged runtime icon differs from the reviewed source");
  for (const size of [16, 48, 128]) {
    assert.equal(
      sha256(path.join(resources, "browser-extension", "icons", `icon${size}.png`)),
      sha256(path.join(root, "browser-extension", "icons", `icon${size}.png`)),
      `packaged extension ${size}px icon differs from reviewed source`,
    );
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(resources, "browser-extension", "manifest.json"), "utf8"));
  assert.equal(manifest.version, "5.1.0");
  assert.deepEqual(manifest.content_scripts[0].js, ["content-core.js", "media-quality-picker.js", "content-safety.js"]);

  const appInfo = await page.evaluate(() => window.electronApp.getAppInfo());
  assert.equal(appInfo.name, "Lumi DM", "packaged renderer bridge did not report the Lumi application identity");
  assert.equal(appInfo.platform, "win32", "packaged renderer bridge did not report the Windows runtime");

  const prepared = await page.evaluate(() => window.electronApp.prepareBrowserExtension());
  preparedPath = prepared.path;
  assert.equal(prepared.samePcAuthentication, "automatic");
  assert.ok(isFile(path.join(preparedPath, "manifest.json")));
  assert.equal(sha256(path.join(preparedPath, "manifest.json")), sha256(path.join(resources, "browser-extension", "manifest.json")),
    "prepared extension differs from the exact packaged extension");
  assert.ok(isFile(path.join(preparedPath, "media-quality-picker.js")));

  const api = await page.evaluate(async () => {
    const downloads = await fetch("/api/downloads?limit=1").then(response => response.json());
    const settings = await fetch("/api/settings").then(response => response.json());
    return { downloads, settings };
  });
  assert.ok(Array.isArray(api.downloads.downloads), "packaged sidecar did not serve the real Lumi API");
  assert.equal(Number(api.settings.default_connections), 32, "packaged sidecar did not preserve the 32-connection authority");

  const windows = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
    .filter(window => !window.isDestroyed())
    .map(window => ({
      id: window.id,
      visible: window.isVisible(),
      alwaysOnTop: window.isAlwaysOnTop(),
      bounds: window.getBounds(),
    })));
  const isMain = window => window.bounds.width >= 900 && !window.alwaysOnTop;
  const isWidget = window => window.bounds.width <= 500 && window.alwaysOnTop;

  await app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find(window => !window.isDestroyed() && window.getBounds().width >= 900 && !window.isAlwaysOnTop());
    if (!main) throw new Error("packaged main window missing");
    main.close();
  });
  await waitFor(async () => {
    const current = (await windows()).find(isMain);
    return current && !current.visible ? current : null;
  }, "packaged close did not leave Lumi in the tray");

  await page.evaluate(() => window.electronApp.showWidget());
  const widget = await waitFor(async () => (await windows()).find(isWidget) || null,
    "packaged widget did not open from the tray process");
  assert.equal(widget.visible, true);
  assert.equal(widget.alwaysOnTop, true);

  await app.evaluate(({ BrowserWindow }) => {
    const main = BrowserWindow.getAllWindows().find(window => !window.isDestroyed() && window.getBounds().width >= 900 && !window.isAlwaysOnTop());
    main?.show();
    main?.focus();
  });
  await waitFor(async () => {
    const current = await windows();
    return current.some(window => isMain(window) && window.visible)
      && current.some(window => isWidget(window) && !window.visible);
  }, "packaged main window did not hide the optional widget");

  const alive = await app.evaluate(({ app: electronApp }) => ({
    isPackaged: electronApp.isPackaged,
    ready: electronApp.isReady(),
  }));
  assert.deepEqual(alive, { isPackaged: true, ready: true });
  console.log("Packaged Windows Lumi: app.asar, sidecar, canonical extension/icons, close-to-tray and widget isolation PASS");
} finally {
  await app?.close().catch(() => {});
  if (preparedPath) fs.rmSync(preparedPath, { recursive: true, force: true });
  fs.rmSync(isolated, { recursive: true, force: true });
}
