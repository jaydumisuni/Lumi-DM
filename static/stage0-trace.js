"use strict";

/*
 * Lumi Stage-0 physical interaction tracer.
 *
 * This file is diagnostic-only. It records action boundaries and correlation IDs;
 * it deliberately does not record URLs, form values, credentials, filenames,
 * browser content, or media/session data.
 */
(() => {
  let activeTraceId = "";
  let activeUntil = 0;

  function newTraceId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `trace-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function pathOnly(value) {
    const text = String(value || "");
    try { return new URL(text, location.origin).pathname; }
    catch (_) { return text.split("?", 1)[0].slice(0, 180); }
  }

  function identify(element) {
    if (!(element instanceof Element)) return "unknown";
    const target = element.closest("button,a,input,select,textarea,[data-action],[data-view]") || element;
    const attributes = [
      "data-window-action",
      "data-main-shell-action",
      "data-shell-action",
      "data-main-task-action",
      "data-action",
      "data-main-view",
      "data-view",
      "data-main-open-new",
      "data-main-browse",
      "data-firmware-action",
      "data-os-action",
      "data-source",
    ];
    for (const name of attributes) {
      const value = target.getAttribute?.(name);
      if (value) return `${name}:${String(value).slice(0, 80)}`;
    }
    if (target.id) return `id:${target.id}`;
    return `tag:${target.tagName?.toLowerCase?.() || "element"}`;
  }

  function emit(event, details = {}, traceId = activeTraceId) {
    const payload = {
      event,
      trace_id: traceId || "",
      source: "renderer",
      ...details,
    };
    try { window.electronApp?.traceStage0?.(payload); }
    catch (_) {}
  }

  function begin(action, source = "renderer") {
    activeTraceId = newTraceId();
    activeUntil = Date.now() + 5000;
    emit("CLICK_RECEIVED", { action, source }, activeTraceId);
    return activeTraceId;
  }

  function current() {
    if (activeTraceId && Date.now() <= activeUntil) return activeTraceId;
    return "";
  }

  function transportSent(method, route) {
    const traceId = current() || newTraceId();
    if (!activeTraceId) {
      activeTraceId = traceId;
      activeUntil = Date.now() + 5000;
    }
    emit("TRANSPORT_SENT", { method: String(method || "GET"), path: pathOnly(route) }, traceId);
    return traceId;
  }

  function responseReceived(method, route, status, ok, traceId = current()) {
    emit(
      "RESPONSE_RECEIVED",
      { method: String(method || "GET"), path: pathOnly(route), status: Number(status || 0), ok: Boolean(ok) },
      traceId,
    );
  }

  document.addEventListener("click", event => {
    if (!event.isTrusted) return;
    begin(identify(event.target));
  }, true);

  document.addEventListener("submit", event => {
    if (!event.isTrusted) return;
    const form = event.target;
    const action = form?.getAttribute?.("data-source-form") || form?.id || "form-submit";
    if (!current()) begin(`submit:${action}`);
    else emit("ACTION_CREATED", { action: `submit:${action}` }, current());
  }, true);

  window.LumiStage0Trace = Object.freeze({
    begin,
    current,
    emit,
    transportSent,
    responseReceived,
  });
})();
