"use strict";

/**
 * Lumi browser integration is intentionally silent at the operating-system
 * level. Download state belongs to the Lumi manager and its corner widget.
 * Legacy bridge calls are absorbed here so they cannot create Windows toasts.
 */
(() => {
  if (!globalThis.chrome?.notifications?.create) return;

  const stateKey = "LUMIDM-last-extension-event";
  chrome.notifications.create = function lumiInternalNotificationOnly(...args) {
    const options = typeof args[0] === "string" ? (args[1] || {}) : (args[0] || {});
    const callback = typeof args[0] === "string" ? args[2] : args[1];
    const event = {
      title: String(options.title || "Lumi DM"),
      message: String(options.message || "").slice(0, 240),
      recordedAt: Date.now(),
    };
    try { chrome.storage.local.set({ [stateKey]: event }); } catch {}
    if (typeof callback === "function") queueMicrotask(() => callback(""));
    return Promise.resolve("");
  };

  chrome.notifications.clear = function lumiClearInternalNotification(_id, callback) {
    if (typeof callback === "function") queueMicrotask(() => callback(true));
    return Promise.resolve(true);
  };

  try {
    chrome.notifications.getAll(items => {
      for (const id of Object.keys(items || {})) {
        try { chrome.notifications.clear(id); } catch {}
      }
    });
  } catch {}
})();
