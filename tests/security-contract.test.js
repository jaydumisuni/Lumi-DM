"use strict";

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
