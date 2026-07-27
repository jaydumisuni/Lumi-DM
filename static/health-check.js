"use strict";

/* Owner-locked Tool Health: one check, one result, one reportable error code. */
(() => {
  const TOOLS_URL = "https://thetechguyds.com/tools#report-bug";

  const style = document.createElement("style");
  style.textContent = `
    [data-settings-section="health"] .health-list,
    [data-settings-section="health"] .health-engine{display:none!important}
    .lumi-health-card{display:grid;justify-items:center;text-align:center;gap:13px;padding:26px 18px 22px}
    .lumi-health-ring{width:76px;height:76px;border-radius:50%;display:grid;place-items:center;border:6px solid rgba(128,140,164,.2);color:#aab4c7;font-size:28px;font-weight:800;box-shadow:inset 0 0 0 1px rgba(255,255,255,.025)}
    .lumi-health-ring.checking{border-color:rgba(112,78,230,.17);border-top-color:#a35dff;border-right-color:#39a8ff;animation:lumiHealthSpin .78s linear infinite;color:transparent}
    .lumi-health-ring.healthy{border-color:#35d873;color:#49e48a;box-shadow:0 0 26px rgba(53,216,115,.16)}
    .lumi-health-ring.error{border-color:#ff737d;color:#ff8f98;box-shadow:0 0 26px rgba(255,115,125,.15)}
    .lumi-health-copy{max-width:470px}.lumi-health-copy strong,.lumi-health-copy small{display:block}.lumi-health-copy strong{font-size:15px}.lumi-health-copy small{margin-top:6px;color:var(--muted);font-size:9px;line-height:1.55}
    .lumi-health-code{display:inline-flex;align-items:center;gap:7px;padding:7px 10px;border:1px solid rgba(255,115,125,.24);border-radius:8px;background:rgba(255,115,125,.07);font:9px ui-monospace,SFMono-Regular,Consolas,monospace;color:#ffadb3}
    .lumi-health-actions{display:flex;justify-content:center;gap:8px;flex-wrap:wrap;margin-top:2px}
    @keyframes lumiHealthSpin{to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(style);

  window.addEventListener("DOMContentLoaded", init, { once: true });

  function init() {
    enforceSimpleHealth();
    const target = document.getElementById("view-settings") || document.body;
    new MutationObserver(enforceSimpleHealth).observe(target, { childList: true, subtree: true });
    document.addEventListener("click", event => {
      const action = event.target.closest("[data-lumi-health-action]")?.dataset.lumiHealthAction;
      if (action === "check") void runHealthCheck();
      if (action === "report") openReportPage();
    }, true);
  }

  function enforceSimpleHealth() {
    const section = document.querySelector('[data-settings-section="health"]');
    if (!section || section.dataset.simpleHealth === "true") return;
    section.dataset.simpleHealth = "true";
    section.innerHTML = initialHtml();
  }

  function initialHtml() {
    return `<section class="settings-card"><div class="settings-card-head"><h3>Tool Health</h3><p>Run one check to confirm that Lumi is ready</p></div><div class="settings-card-body"><div class="lumi-health-card" id="lumi-health-result"><div class="lumi-health-ring">✓</div><div class="lumi-health-copy"><strong>Health not checked</strong><small>Run a health check when Lumi reports a problem or before sending a bug report.</small></div><div class="lumi-health-actions"><button class="btn primary" type="button" data-lumi-health-action="check">Check health</button></div></div></div></section>`;
  }

  async function runHealthCheck() {
    const result = document.getElementById("lumi-health-result");
    if (!result) return;
    result.innerHTML = `<div class="lumi-health-ring checking"></div><div class="lumi-health-copy"><strong>Checking Lumi…</strong><small>Please wait while Lumi verifies its health.</small></div>`;
    try {
      const data = await requestHealth();
      const outcome = evaluateHealth(data);
      result.innerHTML = outcome.ok ? healthyHtml() : errorHtml(outcome.code);
    } catch (error) {
      result.innerHTML = errorHtml(normalizeCode(error?.code || error?.error_code || "LUMI-HEALTH-01"));
    }
  }

  async function requestHealth() {
    if (typeof api === "function") return api("GET", "/api/v4/diagnostics");
    const response = await fetch("/api/v4/diagnostics", { credentials: "same-origin" });
    if (!response.ok) {
      const error = new Error(`Health check failed (${response.status})`);
      error.code = `LUMI-HEALTH-${String(response.status).padStart(3, "0")}`;
      throw error;
    }
    return response.json();
  }

  function evaluateHealth(data) {
    const hasEvidence = Boolean(data && (data.database || data.storage || data.missing_files || typeof data.ok === "boolean" || data.status));
    const databaseOk = data?.database?.ok !== false;
    const storageOk = data?.storage?.ok !== false;
    const missingCount = Number(data?.missing_files?.missing_count || 0);
    const explicitBad = data?.ok === false || String(data?.status || "").toLowerCase() === "error";
    const ok = hasEvidence && !explicitBad && databaseOk && storageOk && missingCount === 0;
    return { ok, code: normalizeCode(data?.error_code || data?.code || data?.diagnostic_code || "LUMI-HEALTH-01") };
  }

  function healthyHtml() {
    return `<div class="lumi-health-ring healthy">✓</div><div class="lumi-health-copy"><strong>Lumi is healthy</strong><small>No problem was found. There is no error code to report.</small></div><div class="lumi-health-actions"><button class="btn" type="button" data-lumi-health-action="check">Check again</button></div>`;
  }

  function errorHtml(code) {
    return `<div class="lumi-health-ring error">!</div><div class="lumi-health-copy"><strong>Lumi needs attention</strong><small>Use this error code when reporting the problem through Bonny.</small></div><div class="lumi-health-code">Error code: ${escapeHtml(code)}</div><div class="lumi-health-actions"><button class="btn" type="button" data-lumi-health-action="check">Check again</button><button class="btn primary" type="button" data-lumi-health-action="report">Report a problem</button></div>`;
  }

  function normalizeCode(value) {
    const code = String(value || "LUMI-HEALTH-01").trim().toUpperCase().replace(/[^A-Z0-9-]+/g, "-");
    return code || "LUMI-HEALTH-01";
  }

  function openReportPage() {
    if (window.electronApp?.openExternal) window.electronApp.openExternal(TOOLS_URL);
    else window.open(TOOLS_URL, "_blank", "noopener");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
  }
})();
