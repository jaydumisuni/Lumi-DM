const { contextBridge, ipcRenderer } = require('electron');
const { randomUUID } = require('crypto');

let lastTraceId = '';
let traceExpiresAt = 0;

function nextTraceId() {
  return randomUUID();
}

function currentTraceId() {
  if (lastTraceId && Date.now() <= traceExpiresAt) return lastTraceId;
  return '';
}

function traceStage0(value = {}) {
  const traceId = String(value.trace_id || currentTraceId() || nextTraceId());
  lastTraceId = traceId;
  traceExpiresAt = Date.now() + 5000;
  ipcRenderer.send('lumi-stage0-trace', {
    ...value,
    trace_id: traceId,
    source: value.source || 'preload-main',
  });
  return traceId;
}

async function invokeWithTrace(channel, ...args) {
  const traceId = currentTraceId() || nextTraceId();
  traceStage0({ event: 'TRANSPORT_SENT', channel, trace_id: traceId, source: 'preload-main' });
  try {
    const result = await ipcRenderer.invoke(channel, ...args);
    traceStage0({ event: 'RESPONSE_RECEIVED', channel, trace_id: traceId, ok: true, source: 'preload-main' });
    return result;
  } catch (error) {
    traceStage0({
      event: 'TRANSPORT_ERROR',
      channel,
      trace_id: traceId,
      ok: false,
      reason: String(error?.message || error || 'IPC invocation failed'),
      source: 'preload-main',
    });
    throw error;
  }
}

contextBridge.exposeInMainWorld('electronApp', {
  traceStage0,
  pickFolder: () => invokeWithTrace('pick-folder'),
  openPath: value => invokeWithTrace('ttg-open-path', value),
  openExternal: value => invokeWithTrace('ttg-open-external', value),
  isElectron: true,
  getDesktopSettings: () => invokeWithTrace('v5-desktop-settings-get'),
  saveDesktopSettings: value => invokeWithTrace('v5-desktop-settings-save', value),
  showWidget: () => ipcRenderer.send('v5-widget-show'),
  checkForUpdates: (manual = false) => invokeWithTrace('v5-update-check', manual),
  getConnectionCapacity: () => invokeWithTrace('v6-capacity-status'),
  runConnectionCapacityTest: () => invokeWithTrace('v6-capacity-run'),
  windowControl: action => invokeWithTrace('ttg-window-control', action),
  getWindowState: () => invokeWithTrace('ttg-window-state'),
  getAppInfo: () => invokeWithTrace('ttg-app-info'),
  onWindowState: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, value) => callback(value || {});
    ipcRenderer.on('ttg-window-state-changed', listener);
    return () => ipcRenderer.removeListener('ttg-window-state-changed', listener);
  },
  onUpdateStatus: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('v5-update-status', listener);
    return () => ipcRenderer.removeListener('v5-update-status', listener);
  },
  onConnectionCapacity: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, value) => callback(value || {});
    ipcRenderer.on('v6-capacity-status', listener);
    return () => ipcRenderer.removeListener('v6-capacity-status', listener);
  },
  onServerState: callback => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, value) => callback(value || {});
    ipcRenderer.on('lumi-server-state', listener);
    return () => ipcRenderer.removeListener('lumi-server-state', listener);
  },
});
