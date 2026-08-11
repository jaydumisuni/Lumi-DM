/* Automatic same-PC popup authentication. External/mobile clients keep the
 * general pairing flow in Lumi Connected Devices; the local extension does not.
 */
"use strict";

const _nativePopupFetch = globalThis.fetch.bind(globalThis);
let _popupTokenPromise = null;

async function _popupSecuritySettings() {
  const values = await chrome.storage.local.get({
    apiToken: "",
    extensionClientId: "",
    server: "http://localhost:7000",
  });
  let serverOrigin = "";
  try { serverOrigin = new URL(values.server).origin; } catch {}
  return {
    token: String(values.apiToken || ""),
    clientId: String(values.extensionClientId || ""),
    server: String(values.server || "http://localhost:7000").replace(/\/$/, ""),
    serverOrigin,
  };
}

function _popupRequestUrl(value) {
  try { return new URL(typeof value === "string" ? value : value.url); }
  catch { return null; }
}

function _popupLocalServer(value) {
  try { return ["localhost", "127.0.0.1", "::1"].includes(new URL(value).hostname.toLowerCase()); }
  catch { return false; }
}

async function _popupEnsureToken(force = false) {
  if (_popupTokenPromise) return _popupTokenPromise;
  _popupTokenPromise = (async () => {
    const settings = await _popupSecuritySettings();
    if (!force && settings.token) return settings.token;
    if (!settings.serverOrigin || !_popupLocalServer(settings.serverOrigin)) return "";
    const clientId = settings.clientId || crypto.randomUUID();
    if (!settings.clientId) await chrome.storage.local.set({ extensionClientId: clientId });
    const response = await _nativePopupFetch(`${settings.server}/api/security/local-extension`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Lumi-Client": "browser-extension-popup-v4",
      },
      body: JSON.stringify({ client_id: clientId, client_name: "Lumi browser extension" }),
      credentials: "omit",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.token) throw new Error(data.error || "Lumi is unavailable");
    await chrome.storage.local.set({ apiToken: data.token, samePcConnected: true });
    return String(data.token);
  })().finally(() => { _popupTokenPromise = null; });
  return _popupTokenPromise;
}

async function _popupAuthenticatedFetch(input, init = {}, retry = true) {
  const url = _popupRequestUrl(input);
  if (!url || !url.pathname.startsWith("/api/")) return _nativePopupFetch(input, init);
  const settings = await _popupSecuritySettings();
  if (!settings.serverOrigin || url.origin !== settings.serverOrigin) return _nativePopupFetch(input, init);
  let token = settings.token;
  if (!token && url.pathname !== "/api/security/local-extension") token = await _popupEnsureToken().catch(() => "");
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Lumi-Client", "browser-extension-popup-v4");
  const response = await _nativePopupFetch(input, { ...init, headers, credentials: "omit" });
  if (response.status === 401 && retry && url.pathname !== "/api/security/local-extension") {
    await chrome.storage.local.remove("apiToken");
    await _popupEnsureToken(true).catch(() => "");
    return _popupAuthenticatedFetch(input, init, false);
  }
  return response;
}

globalThis.fetch = (input, init = {}) => _popupAuthenticatedFetch(input, init, true);

async function _renderSamePcState() {
  const badge = document.getElementById("connection-badge");
  if (!badge) return;
  badge.textContent = "Connecting…";
  badge.className = "connection-badge";
  try {
    await _popupEnsureToken();
    const server = (await _popupSecuritySettings()).server;
    const response = await fetch(`${server}/api/v4/security/me`);
    const data = await response.json();
    if (!response.ok || !data.authenticated || !data.can_write) throw new Error(data.error || "Not connected");
    badge.textContent = "Connected";
    badge.className = "connection-badge on";
  } catch (error) {
    badge.textContent = "Lumi offline";
    badge.className = "connection-badge warn";
    const status = document.getElementById("status-msg");
    if (status) status.textContent = error.message;
  }
}

document.addEventListener("DOMContentLoaded", () => { void _renderSamePcState(); });
