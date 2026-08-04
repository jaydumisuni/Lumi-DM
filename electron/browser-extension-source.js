"use strict";

const fs = require("fs");
const path = require("path");

const REQUIRED_FILES = Object.freeze([
  "manifest.json",
  "background.js",
  "notification-guard.js",
  "browser-bridge.js",
  "security-shim.js",
  "media-quality-bridge.js",
  "content-core.js",
  "media-quality-picker.js",
  "content-safety.js",
  "popup.html",
  "popup.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
]);

function isFile(candidate) {
  try {
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function isCanonicalExtensionDirectory(candidate) {
  if (!candidate) return false;
  try {
    if (!fs.statSync(candidate).isDirectory()) return false;
  } catch {
    return false;
  }
  return REQUIRED_FILES.every(relative => isFile(path.join(candidate, relative)));
}

function extensionCandidates({ appPath = "", resourcesPath = "", isPackaged = false } = {}) {
  const values = [];
  if (isPackaged) {
    if (appPath) values.push(path.join(appPath, "browser-extension"));
    if (resourcesPath) {
      values.push(path.join(resourcesPath, "browser-extension"));
      values.push(path.join(resourcesPath, "app.asar.unpacked", "browser-extension"));
    }
  } else {
    values.push(path.resolve(__dirname, "..", "browser-extension"));
  }
  return [...new Set(values.map(value => path.resolve(value)))];
}

function resolveCanonicalExtension(options = {}) {
  const candidates = extensionCandidates(options);
  const source = candidates.find(isCanonicalExtensionDirectory);
  if (!source) {
    throw new Error(
      `The canonical Lumi browser extension was not packaged. Checked: ${candidates.join(", ")}`
    );
  }
  return source;
}

function copyCanonicalExtension(source, destination) {
  if (!isCanonicalExtensionDirectory(source)) {
    throw new Error("The canonical Lumi browser extension source is incomplete");
  }
  if (fs.existsSync(destination)) {
    throw new Error("The selected extension destination already exists; Lumi will not delete or overwrite it");
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(source, destination, { recursive: true, errorOnExist: true, force: false });
  if (!isCanonicalExtensionDirectory(destination)) {
    throw new Error("Lumi copied an incomplete browser extension package");
  }
  return destination;
}

module.exports = {
  REQUIRED_FILES,
  extensionCandidates,
  isCanonicalExtensionDirectory,
  resolveCanonicalExtension,
  copyCanonicalExtension,
};
