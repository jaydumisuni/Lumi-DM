"use strict";

/*
 * Electron-native modules share Node's http singleton. Patch only requests to
 * Lumi's owned loopback Runtime so existing main/widget/capacity modules receive
 * the per-process credential without duplicating auth logic or changing their
 * domain behavior. External HTTP traffic is untouched.
 */
const http = require("http");

if (!http.__lumiOwnedRuntimeAuth) {
  const originalRequest = http.request.bind(http);

  function isOwnedRuntime(options) {
    if (!options || typeof options !== "object") return false;
    const hostname = String(options.hostname || options.host || "").split(":", 1)[0].toLowerCase();
    const port = Number(options.port || 80);
    return ["127.0.0.1", "localhost", "::1"].includes(hostname) && port === 7000;
  }

  function withOwnedCredential(options) {
    if (!isOwnedRuntime(options)) return options;
    const secret = String(process.env.LUMIDM_DESKTOP_SECRET || "");
    if (!secret) return options;
    return {
      ...options,
      headers: {
        ...(options.headers || {}),
        "X-Lumi-Client": options.headers?.["X-Lumi-Client"] || "electron-desktop",
        "X-Lumi-Desktop-Secret": secret,
      },
    };
  }

  http.request = function lumiRequest(options, callback) {
    return originalRequest(withOwnedCredential(options), callback);
  };
  http.get = function lumiGet(options, callback) {
    const request = http.request(options, callback);
    request.end();
    return request;
  };
  http.__lumiOwnedRuntimeAuth = true;
}

module.exports = http;
