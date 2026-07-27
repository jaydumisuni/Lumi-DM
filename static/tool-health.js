"use strict";

/* Owner-approved Tool Health: one check, one result, one error code. */
(() => {
  const HEALTH_SECTION = '[data-settings-section="health"]';
  const TOOLS_URL = "https://thetechguyds.com/tools#report-bug";

  window.addEventListener("DOMContentLoaded", () => {
    installStyle();
    wrapSettingsRenderer();
    replaceHealthSection(true);
    const root = document.getElementById("view-settings") || document.body;
    new MutationObserver(() => replaceHealthSection(false)).observe(root, { childList: true, subtree: true });
    document.addEventListener("click", handleHealthAction, true);
  });

  function wrapSettingsRenderer() {
    const original = window.renderSettings;
    if (typeof original !== "function" || original.__simpleHealthWrapped) return;
    const wrapped = function (...args) {
      const result = original.apply(this, args);
      replaceHealthSection(true);
      queueMicrotask(() => replaceHealthSection(true));
      return result;
    };
    wrapped.__simpleHealthWrapped = true;
    window.renderSettings = wrapped;
    try { renderSettings = wrapped; } catch (_) {}
  }

  function replaceHealthSection(force) {
    const section = document.querySelector(HEALTH_SECTION);
    if (!section || (!force && section.dataset.simpleHealth === "true")) return;
    section.dataset.simpleHealth = "true";
    section.innerHTML = idleHtml();
  }

  async function handleHealthAction(event) {
    const button = event.target.closest("[data-tool-health-action]");
    if (!button) return;
    event.preventDefault();
    const action = button.dataset.toolHealthAction;
    if (action === "check") return runToolHealthCheck();
    if (action === "report") return openReport(button.dataset.errorCode || "LUMI-HEALTH-199");
  }

  function idleHtml() {
    return `<section class="settings-card simple-health-card">
      <div class="settings-card-head"><h3>Tool Health</h3><p>Run one check to confirm Lumi is working correctly.</p></div>
      <div class="settings-card-body simple-health-body">
        <div class="simple-health-ring idle" aria-hidden="true">✓</div>
        <strong class="simple-health-title">Ready to check</strong>
        <p class="simple-health-copy">Lumi will only show an error code when something needs attention.</p>
        <button class="btn primary" type="button" data-tool-health-action="check">Check Tool Health</button>
      </div>
    </section>`;
  }

  function loadingHtml() {
    return `<section class="settings-card simple-health-card">
      <div class="settings-card-head"><h3>Tool Health</h3><p>Checking Lumi now.</p></div>
      <div class="settings-card-body simple-health-body">
        <div class="simple-health-ring loading" aria-hidden="true"></div>
        <strong class="simple-health-title">Checking tool health…</strong>
        <p class="simple-health-copy">This normally takes only a moment.</p>
      </div>
    </section>`;
  }

  function healthyHtml() {
    return `<section class="settings-card simple-health-card">
      <div class="settings-card-head"><h3>Tool Health</h3><p>Health check complete.</p></div>
      <div class="settings-card-body simple-health-body">
        <div class="simple-health-ring healthy" aria-hidden="true">✓</div>
        <strong class="simple-health-title">Lumi is healthy</strong>
        <p class="simple-health-copy">No error code was found.</p>
        <button class="btn" type="button" data-tool-health-action="check">Check again</button>
      </div>
    </section>`;
  }

  function errorHtml(code, message) {
    return `<section class="settings-card simple-health-card">
      <div class="settings-card-head"><h3>Tool Health</h3><p>Health check complete.</p></div>
      <div class="settings-card-body simple-health-body">
        <div class="simple-health-ring error" aria-hidden="true">!</div>
        <strong class="simple-health-title">Lumi needs attention</strong>
        <p class="simple-health-copy">${escapeHtml(message || "The health check found a problem.")}</p>
        <div class="simple-health-code"><span>Error code</span><strong>${escapeHtml(code)}</strong></div>
        <div class="simple-health-actions">
          <button class="btn primary" type="button" data-tool-health-action="report" data-error-code="${escapeHtml(code)}">Report a bug</button>
          <button class="btn" type="button" data-tool-health-action="check">Check again</button>
        </div>
      </div>
    </section>`;
  }

  async function runToolHealthCheck() {
    const section = document.querySelector(HEALTH_SECTION);
    if (!section) return;
    section.innerHTML = loadingHtml();
    try {
      const data = typeof api === "function"
        ? await api("GET", "/api/v4/diagnostics")
        : await fetchHealth();
      const result = evaluateHealth(data);
      section.innerHTML = result.ok ? healthyHtml() : errorHtml(result.code, result.message);
    } catch (error) {
      section.innerHTML = errorHtml(error.code || "LUMI-HEALTH-001", error.message || "Lumi could not complete the health check.");
    }
  }

  async function fetchHealth() {
    const response = await fetch("/api/v4/diagnostics", { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw Object.assign(new Error(`Health service returned ${response.status}.`), { code: "LUMI-HEALTH-001" });
    return response.json();
  }

  function evaluateHealth(data) {
    if (data?.database?.ok === false) return { ok: false, code: "LUMI-HEALTH-101", message: "Lumi found a problem with its local data." };
    if (data?.storage?.ok === false) return { ok: false, code: "LUMI-HEALTH-102", message: "Lumi cannot use one of its download locations." };
    if (Number(data?.missing_files?.missing_count || 0) > 0) return { ok: false, code: "LUMI-HEALTH-103", message: "Lumi found completed files that are no longer in their saved locations." };
    if (data?.ok === false || data?.healthy === false) return { ok: false, code: "LUMI-HEALTH-199", message: "The health check found a problem." };
    return { ok: true };
  }

  function openReport(code) {
    const url = `${TOOLS_URL}?code=${encodeURIComponent(code)}`;
    if (window.electronApp?.openExternal) window.electronApp.openExternal(url);
    else window.open(url, "_blank", "noopener");
  }

  function installStyle() {
    if (document.getElementById("simple-health-style")) return;
    const style = document.createElement("style");
    style.id = "simple-health-style";
    style.textContent = `
      .simple-health-card{min-height:420px}.simple-health-body{min-height:340px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:13px;padding:34px!important}.simple-health-ring{width:82px;height:82px;border-radius:50%;display:grid;place-items:center;border:6px solid rgba(123,136,161,.2);font-size:34px;font-weight:800}.simple-health-ring.idle{color:#9ca9bc;border-color:rgba(130,143,167,.24)}.simple-health-ring.loading{border-color:rgba(114,82,230,.16);border-top-color:#8e63ff;border-right-color:#3ea6ff;animation:simpleHealthSpin .75s linear infinite}.simple-health-ring.healthy{color:#45df83;border-color:#35d777;box-shadow:0 0 30px rgba(53,215,119,.17)}.simple-health-ring.error{color:#ff8f99;border-color:#ff737d;box-shadow:0 0 30px rgba(255,115,125,.14)}.simple-health-title{font-size:18px}.simple-health-copy{max-width:480px;margin:0;color:var(--muted);font-size:11px;line-height:1.55}.simple-health-code{min-width:250px;padding:12px 18px;border:1px solid rgba(255,115,125,.28);border-radius:10px;background:rgba(62,20,28,.28)}.simple-health-code span,.simple-health-code strong{display:block}.simple-health-code span{font-size:9px;color:var(--muted)}.simple-health-code strong{margin-top:5px;font:700 12px ui-monospace,SFMono-Regular,Consolas,monospace;color:#ff9da5}.simple-health-actions{display:flex;gap:9px;justify-content:center;flex-wrap:wrap}@keyframes simpleHealthSpin{to{transform:rotate(360deg)}}
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  }
})();
