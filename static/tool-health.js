"use strict";

/* Owner-approved Tool Health: one check only, with no engine names exposed. */
(() => {
  const HEALTH_SECTION = '[data-settings-section="health"]';

  window.addEventListener("DOMContentLoaded", () => {
    wrapSettingsRenderer();
    replaceHealthSection();
    const root = document.getElementById("view-settings") || document.body;
    new MutationObserver(replaceHealthSection).observe(root, { childList: true, subtree: true });
    document.addEventListener("click", event => {
      const check = event.target.closest('[data-tool-health-action="check"]');
      if (!check) return;
      event.preventDefault();
      void runToolHealthCheck();
    }, true);
  });

  function wrapSettingsRenderer() {
    const original = window.renderSettings;
    if (typeof original !== "function" || original.__simpleHealthWrapped) return;
    const wrapped = function (...args) {
      const result = original.apply(this, args);
      replaceHealthSection();
      queueMicrotask(replaceHealthSection);
      return result;
    };
    wrapped.__simpleHealthWrapped = true;
    window.renderSettings = wrapped;
    try { renderSettings = wrapped; } catch (_) {}
  }

  function replaceHealthSection() {
    const section = document.querySelector(HEALTH_SECTION);
    if (!section || section.dataset.simpleHealth === "true") return;
    section.dataset.simpleHealth = "true";
    section.innerHTML = `<section class="settings-card"><div class="settings-card-head"><h3>Tool Health</h3><p>Run one check to confirm Lumi is ready</p></div><div class="settings-card-body"><div class="tool-health-check" id="tool-health-result"><div class="tool-health-ring">•</div><div class="tool-health-copy"><strong>Not checked</strong><small>Press Check Tool Health to run the check.</small><code hidden></code></div></div><div class="form-actions"><button class="btn primary" type="button" data-tool-health-action="check">Check Tool Health</button><button class="btn" type="button" data-polish-action="report-health" id="tool-health-report" hidden>Report problem through Bonny</button></div></div></section>`;
  }

  async function runToolHealthCheck() {
    const result = document.getElementById("tool-health-result");
    const report = document.getElementById("tool-health-report");
    if (!result) return;
    if (report) report.hidden = true;
    result.innerHTML = '<div class="tool-health-ring loading"></div><div class="tool-health-copy"><strong>Checking Lumi…</strong><small>Please wait while Lumi checks its health.</small><code hidden></code></div>';
    try {
      if (typeof api !== "function") throw new Error("Health service unavailable");
      const data = await api("GET", "/api/v4/diagnostics");
      let code = "";
      if (data?.database?.ok === false) code = "LUMI-HEALTH-01";
      else if (data?.storage?.ok === false) code = "LUMI-HEALTH-02";
      else if (Number(data?.missing_files?.missing_count || 0) > 0) code = "LUMI-HEALTH-03";
      else if (Object.values(data?.engines || {}).some(value => value === false)) code = "LUMI-HEALTH-04";
      if (code) return showError(result, report, code);
      result.innerHTML = '<div class="tool-health-ring healthy">✓</div><div class="tool-health-copy"><strong>Lumi is healthy</strong><small>No problem was found.</small><code hidden></code></div>';
    } catch (_) {
      showError(result, report, "LUMI-HEALTH-00", "Health check could not finish");
    }
  }

  function showError(result, report, code, title = "Lumi needs attention") {
    result.innerHTML = `<div class="tool-health-ring error">!</div><div class="tool-health-copy"><strong>${escapeHtml(title)}</strong><small>Use this code when reporting the problem.</small><code>${escapeHtml(code)}</code></div>`;
    if (report) report.hidden = false;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[character]));
  }
})();
