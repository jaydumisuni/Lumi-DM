"use strict";

const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

function canonicalLumiIcon() {
  const candidates = [
    path.join(process.resourcesPath || "", "static", "favicon-256.png"),
    path.resolve(__dirname, "..", "static", "favicon-256.png"),
  ];
  const icon = candidates.find(candidate => candidate && fs.existsSync(candidate));
  return icon ? pathToFileURL(icon).href : "";
}

function installWidgetIdentity() {
  const install = () => {
    const logo = document.getElementById("logo-button");
    const icon = canonicalLumiIcon();
    if (!logo || !icon) return;
    logo.src = icon;
    logo.dataset.canonicalLumiIdentity = "true";
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install, { once: true });
  else install();
}

installWidgetIdentity();

module.exports = { canonicalLumiIcon };
