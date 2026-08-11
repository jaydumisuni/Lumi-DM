"use strict";

const assert = require("assert");
const { EventEmitter } = require("events");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const sourcePath = path.resolve(__dirname, "..", "electron", "update-manager.js");
const source = fs.readFileSync(sourcePath, "utf8");
const statuses = [];
const opened = [];
const releaseQueue = [];

const electron = {
  app: {
    getVersion: () => "1.0.0",
    getPath: () => path.join(__dirname, ".update-test-user-data"),
    isPackaged: false,
    quit: () => {},
  },
  dialog: { showMessageBox: async () => ({ response: 1 }) },
  shell: {
    openExternal: async url => { opened.push(url); },
    openPath: async () => "",
  },
};

function responseFor(value) {
  const response = new EventEmitter();
  response.statusCode = value.status || 200;
  response.headers = value.headers || {};
  response.setEncoding = () => {};
  response.resume = () => {};
  return response;
}

const https = {
  get(_url, _options, callback) {
    const request = new EventEmitter();
    request.setTimeout = () => request;
    process.nextTick(() => {
      const next = releaseQueue.shift();
      if (!next) {
        request.emit("error", new Error("No deterministic updater response queued"));
        return;
      }
      const response = responseFor(next);
      callback(response);
      process.nextTick(() => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          response.emit("data", Buffer.from(JSON.stringify(next.body || {})));
        } else if (next.text) {
          response.emit("data", String(next.text));
        }
        response.emit("end");
      });
    });
    return request;
  },
};

const moduleBox = { exports: {} };
const sandbox = {
  module: moduleBox,
  exports: moduleBox.exports,
  require(id) {
    if (id === "electron") return electron;
    if (id === "https") return https;
    return require(id);
  },
  __dirname: path.dirname(sourcePath),
  __filename: sourcePath,
  process,
  Buffer,
  URL,
  console,
  setTimeout,
  clearTimeout,
};
vm.runInNewContext(source, sandbox, { filename: sourcePath });
const { UpdateManager, isNewer, platformAsset, TOOLS_PAGE } = moduleBox.exports;

assert.equal(isNewer("1.1.0", "1.0.0"), true);
assert.equal(isNewer("1.0.0", "1.0.0"), false);
assert.equal(isNewer("0.9.9", "1.0.0"), false);

const nativeAsset = process.platform === "win32"
  ? { name: "Lumi-DM-1.1.0.exe", browser_download_url: "https://example.invalid/Lumi-DM.exe" }
  : process.platform === "darwin"
    ? { name: "Lumi-DM-1.1.0.dmg", browser_download_url: "https://example.invalid/Lumi-DM.dmg" }
    : { name: "Lumi-DM-1.1.0.AppImage", browser_download_url: "https://example.invalid/Lumi-DM.AppImage" };
assert.equal(platformAsset([nativeAsset]).name, nativeAsset.name);

(async () => {
  const updater = new UpdateManager({ onStatus: status => statuses.push(status) });

  releaseQueue.push({
    body: {
      tag_name: "v1.1.0",
      draft: false,
      prerelease: false,
      published_at: "2026-08-11T00:00:00Z",
      assets: [nativeAsset],
    },
  });
  const available = await updater.check(false);
  assert.equal(available.available, true);
  assert.equal(available.version, "1.1.0");
  assert.equal(available.currentVersion, "1.0.0");
  assert.equal(available.assetUrl, nativeAsset.browser_download_url);
  assert(statuses.some(status => status.state === "checking"));
  assert(statuses.some(status => status.state === "available"));

  releaseQueue.push({
    body: {
      tag_name: "v1.1.0",
      draft: false,
      prerelease: false,
      assets: [{ name: "unsupported-package.bin", browser_download_url: "https://example.invalid/lumi.bin" }],
    },
  });
  const noNativeAsset = await updater.check(true);
  assert.equal(noNativeAsset.available, true);
  assert.equal(noNativeAsset.assetUrl, "");
  assert.deepEqual(opened, [TOOLS_PAGE]);

  releaseQueue.push({ status: 503, text: "temporary outage" });
  const failed = await updater.check(false);
  assert.equal(failed.available, false);
  assert.match(failed.error, /503/);
  assert.equal(statuses.at(-1).state, "error");

  console.log("Lumi update manager check/current/available/error behavior: PASS");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
