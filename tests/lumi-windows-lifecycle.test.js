"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const repo = path.resolve(__dirname, "..");
const electronDir = path.join(repo, "electron");
const source = fs.readFileSync(path.join(electronDir, "main.js"), "utf8");

class Emitter {
  constructor() { this.handlers = new Map(); }
  on(name, callback) {
    const values = this.handlers.get(name) || [];
    values.push(callback);
    this.handlers.set(name, values);
    return this;
  }
  once(name, callback) {
    const wrapper = (...args) => {
      this.removeListener(name, wrapper);
      callback(...args);
    };
    return this.on(name, wrapper);
  }
  emit(name, ...args) {
    for (const callback of [...(this.handlers.get(name) || [])]) callback(...args);
  }
  removeListener(name, callback) {
    this.handlers.set(name, (this.handlers.get(name) || []).filter(item => item !== callback));
  }
}

function successfulHttp() {
  return {
    request(_options, callback) {
      const request = new Emitter();
      request.write = () => {};
      request.end = () => {
        const response = new Emitter();
        response.statusCode = 200;
        response.setEncoding = () => {};
        callback(response);
        queueMicrotask(() => {
          response.emit("data", JSON.stringify({ downloads: [] }));
          response.emit("end");
        });
      };
      request.destroy = error => request.emit("error", error);
      return request;
    },
  };
}

async function runScenario(argv) {
  const windows = [];
  const appHandlers = new Map();
  const ipcHandlers = new Map();
  const ipcEvents = new Map();
  let readyHandler = null;
  let trayInstance = null;
  let menuTemplate = null;
  let supervisorStarts = 0;
  let supervisorStops = 0;

  class WebContents extends Emitter {
    constructor(owner) {
      super();
      this.owner = owner;
      this.id = 100 + windows.length;
      this.sent = [];
    }
    setWindowOpenHandler(handler) { this.openHandler = handler; }
    send(...args) { this.sent.push(args); }
  }

  class BrowserWindow extends Emitter {
    constructor(options) {
      super();
      this.options = options;
      this.visible = false;
      this.destroyed = false;
      this.minimized = false;
      this.maximized = false;
      this.focused = false;
      this.webContents = new WebContents(this);
      windows.push(this);
    }
    static fromWebContents(contents) { return windows.find(item => item.webContents === contents) || null; }
    static getFocusedWindow() { return windows.find(item => item.focused) || null; }
    static getAllWindows() { return windows.filter(item => !item.destroyed); }
    isDestroyed() { return this.destroyed; }
    isVisible() { return this.visible; }
    isFocused() { return this.focused; }
    isMinimized() { return this.minimized; }
    isMaximized() { return this.maximized; }
    show() { this.visible = true; this.emit("show"); }
    showInactive() { this.visible = true; }
    hide() { this.visible = false; }
    focus() { this.focused = true; this.emit("focus"); }
    minimize() { this.minimized = true; this.visible = false; }
    restore() { this.minimized = false; this.visible = true; }
    maximize() { this.maximized = true; this.emit("maximize"); }
    unmaximize() { this.maximized = false; this.emit("unmaximize"); }
    close() {
      const event = { prevented: false, preventDefault() { this.prevented = true; } };
      this.emit("close", event);
      if (!event.prevented) { this.destroyed = true; this.emit("closed"); }
    }
    destroy() { this.destroyed = true; this.visible = false; this.emit("closed"); }
    setMenuBarVisibility() {}
    setProgressBar(value) { this.progress = value; }
    setBounds(value) { this.bounds = value; }
    setSkipTaskbar(value) { this.skipTaskbar = value; }
    setAlwaysOnTop() {}
    setVisibleOnAllWorkspaces() {}
    setFocusable(value) { this.focusable = value; }
    loadURL(value) { this.loaded = { type: "url", value }; return Promise.resolve(); }
    loadFile(value) { this.loaded = { type: "file", value }; return Promise.resolve(); }
  }

  class Tray extends Emitter {
    constructor(image) { super(); this.image = image; trayInstance = this; }
    setToolTip(value) { this.tooltip = value; }
    setContextMenu(value) { this.menu = value; }
  }

  const app = {
    isPackaged: false,
    setName(value) { this.name = value; },
    setAppUserModelId(value) { this.appId = value; },
    requestSingleInstanceLock() { return true; },
    quit() { this.quitCalled = true; },
    whenReady() { return { then(callback) { readyHandler = callback; } }; },
    on(name, callback) { appHandlers.set(name, callback); },
    getPath(name) { return path.join(repo, ".test-data", name); },
    getLoginItemSettings() { return { openAtLogin: false, enabled: true, wasOpenedAtLogin: false, wasOpenedAsHidden: false }; },
    setLoginItemSettings(value) { this.loginSettings = value; },
    getName() { return this.name || "Lumi DM"; },
    getVersion() { return "1.0.0"; },
  };

  const electron = {
    app,
    BrowserWindow,
    Menu: {
      setApplicationMenu() {},
      buildFromTemplate(template) { menuTemplate = template; return template; },
    },
    Tray,
    Notification: class extends Emitter {
      static isSupported() { return true; }
      show() {}
    },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    ipcMain: {
      handle(name, callback) { ipcHandlers.set(name, callback); },
      on(name, callback) { ipcEvents.set(name, callback); },
    },
    nativeImage: {
      createFromPath(value) { return { path: value, isEmpty() { return false; } }; },
      createEmpty() { return {}; },
    },
    screen: {
      getPrimaryDisplay() { return { id: 1, workArea: { x: 0, y: 0, width: 1920, height: 1080 } }; },
      getAllDisplays() { return [this.getPrimaryDisplay()]; },
    },
    shell: { openExternal: async () => {}, openPath: async () => "" },
  };

  const supervisor = {
    checkReady: async () => true,
    start() { supervisorStarts += 1; },
    stop() { supervisorStops += 1; },
  };

  class UpdateManager {
    constructor(options) { this.options = options; }
    async check() { return { status: "up-to-date" }; }
  }

  function customRequire(id) {
    if (id === "electron") return electron;
    if (id === "fs") return fs;
    if (id === "http") return successfulHttp();
    if (id === "path") return path;
    if (id.endsWith("server-supervisor")) return supervisor;
    if (id.endsWith("update-manager")) return { UpdateManager };
    if (
      id.endsWith("native-session")
      || id.endsWith("connection-capacity")
      || id.endsWith("desktop-command-poller")
      || id.endsWith("release-gate-contract")
    ) return {};
    throw new Error(`Unexpected require ${id}`);
  }

  const sandbox = {
    require: customRequire,
    module: { exports: {} },
    exports: {},
    __dirname: electronDir,
    process: {
      ...process,
      argv: ["node", "main.js", ...argv],
      platform: "win32",
      execPath: "C:/Program Files/THETECHGUY DIGITAL SOLUTIONS/Lumi DM/Lumi.exe",
      env: {},
    },
    console,
    Buffer,
    URL,
    queueMicrotask,
    setTimeout,
    clearTimeout,
    setInterval: () => 1,
    clearInterval: () => {},
  };

  vm.runInNewContext(source, sandbox, { filename: path.join(electronDir, "main.js") });
  assert(readyHandler, "Electron ready handler registered");
  await readyHandler();
  await new Promise(resolve => setImmediate(resolve));
  await new Promise(resolve => setImmediate(resolve));

  return {
    windows,
    trayInstance,
    menuTemplate,
    supervisorStarts,
    ipcHandlers,
    ipcEvents,
    appHandlers,
    get supervisorStops() { return supervisorStops; },
  };
}

(async () => {
  assert(fs.existsSync(path.join(repo, "static", "favicon-256.png")), "canonical Lumi icon exists");
  assert(!fs.existsSync(path.join(repo, "electron", "main-payload-01.js")), "compressed Electron payload removed");
  assert(!source.includes("Module._compile"), "private runtime compilation removed");

  const normal = await runScenario([]);
  const main = normal.windows[0];
  assert(main && main.visible, "normal launch shows the full app");
  assert.strictEqual(normal.windows.length, 1, "normal launch creates no widget");
  assert.strictEqual(main.options.title, "Lumi Download Manager");
  assert(main.options.icon.endsWith(path.join("static", "favicon-256.png")));
  assert.strictEqual(main.options.skipTaskbar, undefined, "full app owns the taskbar entry");
  assert(normal.trayInstance.image.path.endsWith(path.join("static", "favicon-256.png")));

  main.close();
  assert(!main.destroyed && !main.visible, "close hides main window to tray");
  assert.strictEqual(normal.windows.length, 1, "close never creates the widget");

  const showWidget = normal.menuTemplate.find(item => item.label === "Show download widget");
  assert(showWidget, "tray exposes explicit widget action");
  showWidget.click();
  assert.strictEqual(normal.windows.length, 2);
  const widget = normal.windows[1];
  assert(widget.visible, "explicit tray action opens widget");
  assert.strictEqual(widget.options.skipTaskbar, true);
  assert.strictEqual(widget.skipTaskbar, true);
  assert(widget.options.icon.endsWith(path.join("static", "favicon-256.png")));

  normal.trayInstance.emit("click");
  assert(main.visible, "tray click opens full Lumi");
  assert(!widget.visible, "opening full Lumi hides widget");
  normal.ipcEvents.get("v5-widget-show")();
  assert(!widget.visible, "widget cannot cover an open main window");

  main.close();
  assert(!main.visible && !widget.visible, "closing full app leaves only tray process");
  normal.appHandlers.get("before-quit")();
  assert.strictEqual(normal.supervisorStarts, 1);
  assert.strictEqual(normal.supervisorStops, 1);

  const hidden = await runScenario(["--hidden", "--login-startup"]);
  const hiddenMain = hidden.windows[0];
  assert(hiddenMain && !hiddenMain.visible, "Windows login launch is tray-only");
  assert.strictEqual(hidden.windows.length, 1, "login launch does not create widget");
  hidden.trayInstance.emit("click");
  assert(hiddenMain.visible, "tray click restores login-started app");
  hiddenMain.close();
  assert(!hiddenMain.visible, "restored app closes back to tray");

  console.log("Lumi readable Windows lifecycle and identity contract: 27/27 PASS");
})().catch(error => {
  console.error(error);
  process.exit(1);
});
