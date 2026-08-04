/* Lumi DM same-PC authentication shim.
 *
 * The bundled extension authenticates automatically against loopback Lumi. A
 * manual pairing code is reserved for mobile/LAN clients, not for an extension
 * installed in the same browser on the same computer.
 */

const _lumiNativeFetch = globalThis.fetch.bind(globalThis);
let _lumiTokenPromise = null;

async function _lumiSecuritySettings() {
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

function _lumiRequestUrl(value) {
  try { return new URL(typeof value === "string" ? value : value.url); }
  catch { return null; }
}

function _lumiLocalOrigin(value) {
  try {
    return ["localhost", "127.0.0.1", "::1"].includes(new URL(value).hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function _lumiEnsureToken(force = false) {
  if (_lumiTokenPromise) return _lumiTokenPromise;
  _lumiTokenPromise = (async () => {
    const settings = await _lumiSecuritySettings();
    if (!force && settings.token) return settings.token;
    if (!settings.serverOrigin || !_lumiLocalOrigin(settings.serverOrigin)) return "";
    const clientId = settings.clientId || crypto.randomUUID();
    if (!settings.clientId) await chrome.storage.local.set({ extensionClientId: clientId });
    const response = await _lumiNativeFetch(`${settings.server}/api/security/local-extension`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Lumi-Client": "browser-extension-auto-v5",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_name: `Lumi browser extension (${navigator.userAgent.includes("Firefox") ? "Firefox" : "Chromium"})`,
      }),
      credentials: "omit",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.token) {
      throw new Error(data.error || `Lumi same-PC authentication failed (${response.status})`);
    }
    await chrome.storage.local.set({ apiToken: data.token, samePcConnected: true });
    return String(data.token);
  })().finally(() => { _lumiTokenPromise = null; });
  return _lumiTokenPromise;
}

async function _lumiAuthenticatedRequest(input, init = {}, retry = true) {
  const url = _lumiRequestUrl(input);
  if (!url || !url.pathname.startsWith("/api/")) {
    return _lumiNativeFetch(input, init);
  }
  const settings = await _lumiSecuritySettings();
  if (!settings.serverOrigin || url.origin !== settings.serverOrigin) {
    return _lumiNativeFetch(input, init);
  }
  let token = settings.token;
  if (!token && url.pathname !== "/api/security/local-extension") {
    token = await _lumiEnsureToken().catch(() => "");
  }
  const headers = new Headers(
    init.headers || (input instanceof Request ? input.headers : undefined)
  );
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Lumi-Client", "browser-extension-v4");
  const response = await _lumiNativeFetch(input, { ...init, headers, credentials: "omit" });
  if (response.status === 401 && retry && url.pathname !== "/api/security/local-extension") {
    await chrome.storage.local.remove("apiToken");
    await _lumiEnsureToken(true).catch(() => "");
    return _lumiAuthenticatedRequest(input, init, false);
  }
  return response;
}

globalThis.fetch = (input, init = {}) => _lumiAuthenticatedRequest(input, init, true);
globalThis.lumiEnsureSamePcToken = _lumiEnsureToken;
