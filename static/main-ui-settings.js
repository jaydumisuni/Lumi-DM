"use strict";
(() => {
  const UI = window.LumiMainUI;
  const { NOTIFY_KEY, CONNECTIONS, h, number, label } = UI;
  function renderSettingsPrimary() {
    const element = document.getElementById("view-settings");
    if (!element) return;
    const settings = state?.settings || {};
    const defaultConnections = number(settings.default_connections || 32);
    element.innerHTML = `<div class="lumi-settings"><nav class="lumi-settings-nav"><button class="active" data-main-settings-tab="general">General</button><button data-main-settings-tab="storage">Storage</button><button data-main-settings-tab="security">Security</button><button data-main-settings-tab="health">Tool Health</button><button data-main-settings-tab="widget">Widget</button></nav><div>
      <section class="lumi-settings-section active" data-main-settings-section="general">${generalSettings(settings, defaultConnections)}</section>
      <section class="lumi-settings-section" data-main-settings-section="storage">${storageSettings(settings)}</section>
      <section class="lumi-settings-section" data-main-settings-section="security">${securitySettings()}</section>
      <section class="lumi-settings-section" data-main-settings-section="health">${healthSettings()}</section>
      <section class="lumi-settings-section" data-main-settings-section="widget" id="lumi-widget-settings">${widgetLoading()}</section>
    </div></div>`;
    void loadWidgetSettings();
  }

  function generalSettings(settings, defaultConnections) {
    const notify = localStorage.getItem(NOTIFY_KEY) !== "false";
    return `<section class="lumi-setting-card"><div class="lumi-setting-head"><h3>Transfer limits</h3><p>Download behaviour used unless a queue overrides it</p></div><div class="lumi-setting-body"><form data-form="general-settings"><div class="lumi-setting-row"><div class="lumi-setting-copy"><strong>Maximum simultaneous downloads</strong><small>Shared by every queue unless overridden</small></div><input class="input" name="max_concurrent" type="number" min="1" max="128" value="${h(settings.max_concurrent || state.capabilities?.max_concurrent || 8)}"></div><div class="lumi-setting-row"><div class="lumi-setting-copy"><strong>Default connections per download</strong><small>32 is the default; lower it only for restrictive servers</small></div><select class="select" name="default_connections">${CONNECTIONS.map(value => `<option value="${value}" ${value === defaultConnections ? "selected" : ""}>${value} connections</option>`).join("")}</select></div><div class="lumi-setting-row"><div class="lumi-setting-copy"><strong>When all work finishes</strong><small>Runs only after post-processing also ends</small></div><select class="select" name="completion_action">${["none","sleep","shutdown","restart"].map(item => `<option value="${item}" ${settings.completion_action === item ? "selected" : ""}>${h(label(item))}</option>`).join("")}</select></div><div class="form-actions"><button class="btn primary" type="submit">Save transfer settings</button></div></form></div></section><section class="lumi-setting-card"><div class="lumi-setting-head"><h3>Notifications</h3><p>Choose whether completed downloads create a Lumi notification</p></div><div class="lumi-setting-body"><label class="lumi-switch"><span class="lumi-setting-copy"><strong>Download completion notifications</strong><small>The bell still keeps update and error notices that need attention.</small></span><input type="checkbox" name="download_notifications" ${notify ? "checked" : ""}></label></div></section>`;
  }

  function storageSettings(settings) {
    return `<section class="lumi-setting-card"><div class="lumi-setting-head"><h3>Download locations</h3><p>Type a path or choose a folder through Explorer</p></div><div class="lumi-setting-body"><form data-form="storage-settings"><div class="lumi-setting-row"><div class="lumi-setting-copy"><strong>Default final folder</strong><small>Completed downloads and category folders are placed here</small></div><div class="lumi-folder-control"><input class="input" name="default_dir" value="${h(settings.default_dir || "")}"><button class="btn" type="button" data-main-browse="default_dir">Browse…</button></div></div><div class="lumi-setting-row"><div class="lumi-setting-copy"><strong>Temporary download folder</strong><small>Segments and unfinished files remain here until verified</small></div><div class="lumi-folder-control"><input class="input" name="temp_dir" value="${h(settings.temp_dir || "")}"><button class="btn" type="button" data-main-browse="temp_dir">Browse…</button></div></div><div class="form-actions"><button class="btn primary" type="submit">Save locations</button></div></form></div></section>`;
  }

  function securitySettings() {
    return `<section class="lumi-setting-card"><div class="lumi-setting-head"><h3>Pair another device</h3><p>Connect a trusted Lumi client such as mobile or macOS</p></div><div class="lumi-setting-body"><form class="form-stack" data-form="pairing-code"><div class="field-row"><label>Device name<input class="input" name="client_name" required value="Another Lumi device"></label><label>Access<select class="select" name="role"><option value="owner">Full access</option><option value="read_only">Read only</option></select></label></div><button class="btn primary" type="submit">Generate one-time code</button><div id="pair-code-output"></div></form></div></section><section class="lumi-setting-card"><div class="lumi-setting-head"><h3>Paired devices</h3><p>Revoke access when a device is no longer trusted</p></div><div class="lumi-setting-body" id="paired-clients"><div class="empty">Open this tab to load paired devices.</div></div></section>`;
  }

  function healthSettings() {
    return `<section class="lumi-setting-card"><div class="lumi-setting-head"><h3>Tool Health</h3><p>One overall check. Engine names are never exposed here.</p></div><div class="lumi-setting-body"><div class="lumi-health" id="lumi-health-result"><div class="lumi-health-ring">✓</div><strong>Ready to check</strong><p>Lumi only shows an error code when something needs attention.</p><button class="btn primary" type="button" data-main-health-check>Check Tool Health</button></div></div></section>`;
  }

  function widgetLoading() {
    return `<section class="lumi-setting-card"><div class="lumi-setting-head"><h3>Widget</h3><p>Loading the locked widget settings…</p></div><div class="lumi-setting-body"><div class="empty">Preparing widget controls.</div></div></section>`;
  }

  async function loadWidgetSettings() {
    const section = document.getElementById("lumi-widget-settings");
    if (!section) return;
    let value = { corner: "bottom-right", margin: 12, scale: 1, visible: true, displayId: "primary", showUpload: false, displays: [{ id: "primary", label: "Primary display" }] };
    try { if (window.electronApp?.getDesktopSettings) value = { ...value, ...(await window.electronApp.getDesktopSettings()) }; } catch (_) {}
    section.innerHTML = `<section class="lumi-setting-card"><div class="lumi-setting-head"><h3>Widget</h3><p>Position and behaviour of the locked Lumi speed widget</p></div><div class="lumi-setting-body"><form id="lumi-widget-form"><div class="lumi-setting-row"><div class="lumi-setting-copy"><strong>Widget position</strong><small>The widget stays inside the selected screen work area</small></div><select class="select" name="corner"><option value="bottom-right" ${value.corner === "bottom-right" ? "selected" : ""}>Bottom right</option><option value="bottom-left" ${value.corner === "bottom-left" ? "selected" : ""}>Bottom left</option><option value="top-right" ${value.corner === "top-right" ? "selected" : ""}>Top right</option><option value="top-left" ${value.corner === "top-left" ? "selected" : ""}>Top left</option></select></div><div class="lumi-setting-row"><div class="lumi-setting-copy"><strong>Display</strong><small>Choose which monitor owns the widget</small></div><select class="select" name="displayId">${(value.displays || []).map(display => `<option value="${h(display.id)}" ${String(value.displayId) === String(display.id) ? "selected" : ""}>${h(display.label)}</option>`).join("")}</select></div><div class="lumi-setting-row"><div class="lumi-setting-copy"><strong>Edge margin</strong><small>Distance from the usable screen edge</small></div><input class="input" name="margin" type="number" min="4" max="80" value="${number(value.margin || 12)}"></div><div class="lumi-setting-row"><div class="lumi-setting-copy"><strong>Widget size</strong><small>Changes size proportionally without stretching the logo</small></div><select class="select" name="scale"><option value="0.85" ${number(value.scale) === .85 ? "selected" : ""}>Small</option><option value="1" ${number(value.scale || 1) === 1 ? "selected" : ""}>Normal</option><option value="1.15" ${number(value.scale) === 1.15 ? "selected" : ""}>Large</option></select></div><label class="lumi-switch"><span class="lumi-setting-copy"><strong>Show permanent speed widget</strong><small>Show it while Lumi is minimized or hidden. It stays hidden while the main app is open.</small></span><input type="checkbox" name="visible" ${value.visible !== false ? "checked" : ""}></label><label class="lumi-switch"><span class="lumi-setting-copy"><strong>Show upload speed while idle</strong><small>Include live upload usage when no download is active.</small></span><input type="checkbox" name="showUpload" ${value.showUpload ? "checked" : ""}></label><div class="form-actions"><button class="btn primary" id="lumi-widget-save" type="submit">Save widget settings</button></div></form></div></section>`;
    section.querySelector("#lumi-widget-form")?.addEventListener("submit", saveWidgetSettings);
  }

  async function saveWidgetSettings(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("#lumi-widget-save");
    const value = { corner: form.elements.corner.value, displayId: form.elements.displayId.value, margin: number(form.elements.margin.value || 12), scale: number(form.elements.scale.value || 1), visible: form.elements.visible.checked, showUpload: form.elements.showUpload.checked };
    try {
      await window.electronApp?.saveDesktopSettings?.(value);
      button.textContent = "Saved";
      button.style.background = "#25c861";
      setTimeout(() => { button.textContent = "Save widget settings"; button.style.background = ""; }, 2200);
    } catch (error) { if (typeof toast === "function") toast("Widget settings not saved", error.message, "error"); }
  }

  Object.assign(UI, { renderSettingsPrimary });
})();
