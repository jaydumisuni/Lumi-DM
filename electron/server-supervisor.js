"use strict";

const { app, BrowserWindow } = require("electron");
const { spawn, spawnSync } = require("child_process");
const http = require("http");
const path = require("path");
const { writeStage0Trace } = require("./stage0-trace");

let ownedProcess = null;
let quitting = false;
let consecutiveFailures = 0;
let restartAttempts = 0;
let lastRestartAt = 0;
let wasReady = false;
let timer = null;

function serverCommand() {
  const env = { ...process.env };
  if (app.isPackaged) {
    const extension = process.platform === "win32" ? ".exe" : "";
    env.LUMIDM_STATIC_DIR = path.join(process.resourcesPath, "static");
    env.LUMIDM_DATA_DIR = app.getPath("userData");
    return {
      command: path.join(process.resourcesPath, "server", `LUMIDM-server${extension}`),
      args: ["--host", "127.0.0.1", "--port", "7000"],
      env,
    };
  }
  return {
    command: process.env.LUMIDM_PYTHON || (process.platform === "win32" ? "python" : "python3"),
    args: [path.resolve(__dirname, "..", "server.py"), "--host", "127.0.0.1", "--port", "7000"],
    env,
  };
}

function checkReady(timeout = 2500) {
  return new Promise(resolve => {
    const request = http.get({
      hostname: "127.0.0.1",
      port: 7000,
      path: "/api/downloads?limit=1",
      timeout,
    }, response => {
      response.resume();
      resolve((response.statusCode || 500) < 500);
    });
    request.on("timeout", () => { request.destroy(); resolve(false); });
    request.on("error", () => resolve(false));
  });
}

function spawnServer() {
  if (quitting || (ownedProcess && !ownedProcess.killed)) return false;
  const now = Date.now();
  if (now - lastRestartAt < 2500) return false;
  lastRestartAt = now;
  restartAttempts += 1;
  const spec = serverCommand();
  writeStage0Trace("SIDECAR_SPAWN_REQUEST", {
    process: path.basename(spec.command),
    reason: `attempt-${restartAttempts}`,
  });
  try {
    ownedProcess = spawn(spec.command, spec.args, {
      stdio: "ignore",
      env: spec.env,
      windowsHide: true,
    });
    writeStage0Trace("SIDECAR_SPAWNED", {
      process: path.basename(spec.command),
      pid: Number(ownedProcess.pid || 0),
    });
    ownedProcess.once("error", error => {
      writeStage0Trace("SIDECAR_PROCESS_ERROR", {
        pid: Number(ownedProcess?.pid || 0),
        reason: String(error?.message || error || "spawn error"),
      });
      ownedProcess = null;
    });
    ownedProcess.once("exit", (code, signal) => {
      writeStage0Trace("SIDECAR_EXIT", {
        pid: Number(ownedProcess?.pid || 0),
        exit_code: code === null ? -1 : Number(code),
        signal: String(signal || ""),
      });
      ownedProcess = null;
    });
    return true;
  } catch (error) {
    writeStage0Trace("SIDECAR_SPAWN_FAILED", {
      process: path.basename(spec.command),
      reason: String(error?.message || error || "spawn failed"),
    });
    ownedProcess = null;
    return false;
  }
}

function reconnectWindows() {
  writeStage0Trace("SIDECAR_RECOVERED", { ready: true });
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.isDestroyed()) continue;
    const bounds = window.getBounds();
    if (bounds.width < 650) continue;
    const url = window.webContents.getURL();
    if (!url || url.startsWith("file:") || url.startsWith("chrome-error:") || url === "about:blank") {
      void window.loadURL("http://127.0.0.1:7000");
    }
    window.webContents.send("lumi-server-state", { ready: true, recovered: true });
  }
}

async function tick() {
  const ready = await checkReady();
  if (ready) {
    consecutiveFailures = 0;
    restartAttempts = 0;
    if (!wasReady) reconnectWindows();
    wasReady = true;
    return true;
  }

  consecutiveFailures += 1;
  if (wasReady || consecutiveFailures === 1 || consecutiveFailures === 3) {
    writeStage0Trace("SIDECAR_NOT_READY", {
      ready: false,
      reason: `consecutive-failures-${consecutiveFailures}`,
    });
  }
  wasReady = false;
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("lumi-server-state", {
        ready: false,
        failures: consecutiveFailures,
      });
    }
  }
  if (consecutiveFailures >= 3 && restartAttempts < 6) spawnServer();
  if (restartAttempts >= 6 && Date.now() - lastRestartAt > 60_000) restartAttempts = 0;
  return false;
}

function start() {
  if (quitting) return;
  writeStage0Trace("SIDECAR_SUPERVISOR_START", { process: app.isPackaged ? "packaged" : "source" });
  spawnServer();
  if (!timer) timer = setInterval(() => void tick(), 2500);
  setTimeout(() => void tick(), 900);
}

function stop() {
  quitting = true;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (ownedProcess && !ownedProcess.killed) {
    try {
      writeStage0Trace("SIDECAR_STOP_REQUEST", { pid: Number(ownedProcess.pid || 0) });
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(ownedProcess.pid), "/F", "/T"]);
      } else {
        ownedProcess.kill("SIGTERM");
      }
    } catch (error) {
      writeStage0Trace("SIDECAR_STOP_FAILED", {
        pid: Number(ownedProcess?.pid || 0),
        reason: String(error?.message || error || "stop failed"),
      });
    }
  }
  ownedProcess = null;
}

module.exports = { checkReady, start, stop, tick };
