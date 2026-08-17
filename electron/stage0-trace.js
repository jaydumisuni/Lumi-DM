"use strict";

// Loaded by the Runtime supervisor before the rest of the native shell. The
// side-effect module patches only 127.0.0.1:7000 Node HTTP calls and injects the
// per-process secret once the supervisor generates it.
require("./runtime-http-auth");

const { app, ipcMain } = require("electron");
const fs = require("fs");
const path = require("path");

const TRACE_FILENAME = "LUMIDM-stage0-electron-trace.jsonl";
const MAX_TEXT = 180;
const ALLOWED_DETAIL_KEYS = new Set([
  "action",
  "channel",
  "method",
  "path",
  "status",
  "ok",
  "pid",
  "process",
  "ready",
  "exit_code",
  "signal",
  "reason",
  "window",
  "source",
  "trace_id",
]);

function enabled() {
  return process.env.LUMI_STAGE0_TRACE !== "0";
}

function cleanText(value) {
  return String(value ?? "").replace(/[\r\n\t]+/g, " ").slice(0, MAX_TEXT);
}

function cleanDetails(value) {
  const source = value && typeof value === "object" ? value : {};
  const output = {};
  for (const [key, item] of Object.entries(source)) {
    if (!ALLOWED_DETAIL_KEYS.has(key)) continue;
    if (typeof item === "boolean" || typeof item === "number") output[key] = item;
    else if (item !== null && item !== undefined) output[key] = cleanText(item);
  }
  return output;
}

function tracePath() {
  const override = String(process.env.LUMIDM_STAGE0_ELECTRON_TRACE || "").trim();
  if (override) return path.resolve(override);
  return path.join(app.getPath("userData"), TRACE_FILENAME);
}

function writeStage0Trace(event, details = {}) {
  if (!enabled()) return;
  try {
    const record = {
      timestamp: new Date().toISOString(),
      process: "electron-main",
      event: cleanText(event || "TRACE"),
      ...cleanDetails(details),
    };
    fs.mkdirSync(path.dirname(tracePath()), { recursive: true });
    fs.appendFileSync(tracePath(), `${JSON.stringify(record)}\n`, "utf8");
  } catch (_) {
    // Diagnostics must never become an application availability dependency.
  }
}

// Modern Electron sandboxes preload scripts by default. Keep filesystem and
// path ownership in the main process: preload forwards bounded correlation
// metadata only, and this filter is the sole persistence boundary.
if (!ipcMain.__lumiStage0TraceForwarder) {
  ipcMain.__lumiStage0TraceForwarder = true;
  ipcMain.on("ttg-stage0-trace", (_event, payload = {}) => {
    const value = payload && typeof payload === "object" ? payload : {};
    writeStage0Trace(value.event || "TRACE", {
      trace_id: value.trace_id,
      source: "preload-main",
      action: value.action,
      channel: value.channel,
      method: value.method,
      path: value.path,
      reason: value.reason,
      status: value.status,
      ok: value.ok,
    });
  });
}

module.exports = { TRACE_FILENAME, writeStage0Trace };
