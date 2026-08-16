"use strict";

/*
 * Lumi Stage-0 physical interaction tracer.
 *
 * Diagnostic-only: records action boundaries and correlation IDs. It does not
 * record URLs with query strings, form values, credentials, filenames, browser
 * content, request bodies, media data, or session material.
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
    activeTraceId = traceId;
    activeUntil = Date.now() + 5000;
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

  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function stage0Fetch(input, init = {}) {
    const requestUrl = typeof input === "string" || input instanceof URL ? String(input) : String(input?.url || "");
    let parsed;
    try { parsed = new URL(requestUrl, location.href); }
    catch (_) { return nativeFetch(input, init); }

    const sameOriginApi = parsed.origin === location.origin && parsed.pathname.startsWith("/api/");
    if (!sameOriginApi) return nativeFetch(input, init);

    const method = String(init.method || input?.method || "GET").toUpperCase();
    const traceId = transportSent(method, parsed.pathname);
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value));
    headers.set("X-Lumi-Trace-Id", traceId);

    try {
      const response = await nativeFetch(input, { ...init, headers });
      responseReceived(method, parsed.pathname, response.status, response.ok, traceId);
      return response;
    } catch (error) {
      emit(
        "TRANSPORT_ERROR",
        { method, path: parsed.pathname, ok: false, reason: String(error?.message || error || "fetch failed") },
        traceId,
      );
      throw error;
    }
  };

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
