"use strict";

/* Owner-approved Lumi main UI corrections. Floating widget code is intentionally untouched. */
(() => {
  const TOOLS_URL = "https://thetechguyds.com/tools";
  const NOTIFY_KEY = "LUMI.notifications.downloadComplete";
  const EXTENSION_PROMPT_KEY = "LUMI.extensionPrompt.dismissed";
  const CONNECTION_OPTIONS = [4, 8, 16, 24, 32, 48, 64, 96, 128];

  const originalDirectSourceHtml = typeof window.directSourceHtml === "function" ? window.directSourceHtml : null;
  const originalCommonDestinationFields = typeof window.commonDestinationFields === "function" ? window.commonDestinationFields : null;

  window.injectDesktopSettings = () => {};
  window.renderSettings = renderPolishedSettings;
  try { renderSettings = renderPolishedSettings; } catch (_) {}

  if (originalCommonDestinationFields) {
    window.commonDestinationFields = function polishedDestinationFields() {
      const html = originalCommonDestinationFields();
      return html.replace(
        /<label class="field">Final folder<input class="input" name="target_dir"([^>]*)><\/label>/,
        '<label class="field">Final folder<div class="folder-control"><input class="input" name="target_dir"$1><button class="btn" type="button" data-browse-target="target_dir">Browse…</button></div></label>'
      );
    };
    try { commonDestinationFields = window.commonDestinationFields; } catch (_) {}
  }

  if (originalDirectSourceHtml) {
    window.directSourceHtml = function polishedDirectSourceHtml() {
      const html = originalDirectSourceHtml();
      const profiles = (appState().hostProfiles || []).map(profile => `<option value="${safe(profile.id)}">${safe(profile.name)} · ${safe(profile.host_pattern)}</option>`).join("");
      const auth = `<details class="source-session"><summary>Site login or saved session (only when required)</summary><div class="source-session-body"><p class="source-session-note">Leave this as None for normal public downloads. Choose a saved site session only when the source requires an account.</p><label class="field">Saved site session<select class="select" name="host_profile_id"><option value="">None — public download</option>${profiles}</select></label></div></details>`;
      const withAuth = html.replace('<div class="form-actions">', `${auth}<div class="form-actions">`);
      if (!(appState().settings || {}).default_connections) return withAuth.replace(/(name="connections"[^>]*value=")8(")/, "$132$2");
      return withAuth;
    };
    try { directSourceHtml = window.directSourceHtml; } catch (_) {}
  }

  window.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      rebuildSidebar();
      patchTitlebarAndMenus();
      bindGlobalPolishActions();
      maybeShowExtensionPrompt();
      const settingsObserver = new MutationObserver(() => {
        const view = document.getElementById("view-settings");
        if (view?.classList.contains("active") && !view.querySelector('[data-tab="health"]')) renderPolishedSettings();
      });
      settingsObserver.observe(document.getElementById("content") || document.body, { childList: true, subtree: true });
    }, 0);
  });

  function rebuildSidebar() {
    const nav = document.querySelector(".nav-list");
    if (!nav || nav.dataset.ownerOrder === "true") return;
    const get = view => nav.querySelector(`.nav-item[data-view="${view}"]`);
    const order = ["overview", "downloads", "unfinished", "finished", "queues", "categories", "grabber"];
    const fragment = document.createDocumentFragment();
    for (const view of order) { const item = get(view); if (item) fragment.appendChild(item); }
    const firmware = get("firmware");
    const operating = get("operating_systems");
    const group = document.createElement("div");
    group.className = "nav-group";
    group.innerHTML = '<button class="nav-item nav-group-toggle" type="button" aria-expanded="false"><span>⌄</span>Technician <span class="nav-chevron">›</span></button><div class="nav-submenu"></div>';
    const submenu = group.querySelector(".nav-submenu");
    if (firmware) submenu.appendChild(firmware);
    if (operating) submenu.appendChild(operating);
    group.querySelector(".nav-group-toggle").addEventListener("click", () => {
      const open = !group.classList.contains("open");
      group.classList.toggle("open", open);
      group.querySelector(".nav-group-toggle").setAttribute("aria-expanded", String(open));
    });
    fragment.appendChild(group);
    nav.replaceChildren(fragment);
    nav.dataset.ownerOrder = "true";
    nav.addEventListener("click", event => {
      const child = event.target.closest('.nav-submenu .nav-item');
      if (child) group.querySelector(".nav-group-toggle").classList.add("child-active");
      else if (event.target.closest('.nav-item:not(.nav-group-toggle)')) group.querySelector(".nav-group-toggle").classList.remove("child-active");
    });
  }

  function renderPolishedSettings() {
    const element = document.getElementById("view-settings");
    if (!element) return;
    const settings = appState().settings || {};
    const defaultConnections = Number(settings.default_connections || 32);
    element.innerHTML = `<div class="settings-layout"><nav class="settings-nav">
      <button class="active" data-action="settings-tab" data-tab="general">General</button>
      <button data-action="settings-tab" data-tab="storage">Storage</button>
      <button data-action="settings-tab" data-tab="security">Security</button>
      <button data-action="settings-tab" data-tab="health">Tool Health</button>
      <button data-action="settings-tab" data-tab="widget">Widget</button>
    </nav><div>
      <section class="settings-section active" data-settings-section="general">${generalHtml(settings, defaultConnections)}</section>
      <section class="settings-section" data-settings-section="storage">${storageHtml(settings)}</section>
      <section class="settings-section" data-settings-section="security">${securityHtml()}</section>
      <section class="settings-section" data-settings-section="health">${healthHtml()}</section>
      <section class="settings-section" data-settings-section="widget" id="owner-widget-settings">${widgetLoadingHtml()}</section>
    </div></div>`;
    if (element.dataset.polishBound !== "true") {
      element.addEventListener("click", onSettingsClick);
      element.addEventListener("submit", onSettingsSubmit, true);
      element.addEventListener("change", onSettingsChange, true);
      element.dataset.polishBound = "true";
    }
    void loadWidgetSettings();
  }

  function generalHtml(settings, defaultConnections) {
    const notify = localStorage.getItem(NOTIFY_KEY) !== "false";
    return `<section class="settings-card"><div class="settings-card-head"><h3>Transfer limits</h3><p>Download behaviour used unless a queue overrides it</p></div><div class="settings-card-body"><form data-form="general-settings">
      <div class="setting-row"><div class="setting-label"><strong>Maximum simultaneous downloads</strong><small>Shared by every queue unless overridden</small></div><input class="input" name="max_concurrent" type="number" min="1" max="128" value="${safe(settings.max_concurrent || appState().capabilities?.max_concurrent || 8)}"></div>
      <div class="setting-row"><div class="setting-label"><strong>Default connections per download</strong><small>32 is the default; lower it only for restrictive servers</small></div><select class="select connections-select" name="default_connections">${CONNECTION_OPTIONS.map(value => `<option value="${value}" ${value === defaultConnections ? "selected" : ""}>${value} connections</option>`).join("")}</select></div>
      <div class="setting-row"><div class="setting-label"><strong>When all work finishes</strong><small>Runs only after post-processing also ends</small></div><select class="select" name="completion_action">${["none","sleep","shutdown","restart"].map(item => `<option value="${item}" ${settings.completion_action === item ? "selected" : ""}>${safe(typeof statusLabel === "function" ? statusLabel(item) : item)}</option>`).join("")}</select></div>
      <div class="form-actions"><button class="btn primary" type="submit">Save transfer settings</button></div></form></div></section>
      <section class="settings-card"><div class="settings-card-head"><h3>Notifications</h3><p>Choose whether completed downloads create a Lumi notification</p></div><div class="settings-card-body"><label class="check ttg-switch"><span class="ttg-switch-copy"><strong>Download completion notifications</strong><small>The bell still keeps update and error notices that need attention.</small></span><input type="checkbox" name="download_notifications" ${notify ? "checked" : ""}></label></div></section>`;
  }

  function storageHtml(settings) {
    return `<section class="settings-card"><div class="settings-card-head"><h3>Download locations</h3><p>Type a path or choose the folder through Explorer</p></div><div class="settings-card-body"><form data-form="storage-settings">
      <div class="setting-row"><div class="setting-label"><strong>Default final folder</strong><small>Completed downloads and category folders are placed here</small></div><div class="folder-control"><input class="input" name="default_dir" value="${safe(settings.default_dir || "")}"><button class="btn" type="button" data-browse-target="default_dir">Browse…</button></div></div>
      <div class="setting-row"><div class="setting-label"><strong>Temporary download folder</strong><small>Segments and unfinished files remain here until verified</small></div><div class="folder-control"><input class="input" name="temp_dir" value="${safe(settings.temp_dir || "")}"><button class="btn" type="button" data-browse-target="temp_dir">Browse…</button></div></div>
      <div class="form-actions"><button class="btn primary" type="submit">Save locations</button></div></form></div></section>`;
  }

  function securityHtml() {
    return `<section class="settings-card"><div class="settings-card-head"><h3>Pair another device</h3><p>Connect another Lumi client such as mobile, macOS or a trusted browser extension</p></div><div class="settings-card-body"><form class="form-stack" data-form="pairing-code"><div class="field-row"><label>Device name<input class="input" name="client_name" required value="Another Lumi device"></label><label>Access<select class="select" name="role"><option value="owner">Full access</option><option value="read_only">Read only</option></select></label></div><button class="btn primary" type="submit">Generate one-time code</button><div id="pair-code-output"></div></form></div></section><section class="settings-card"><div class="settings-card-head"><h3>Paired devices</h3><p>Revoke access immediately when a device is no longer trusted</p></div><div class="settings-card-body" id="paired-clients"><div class="empty">Open this tab to load paired devices.</div></div></section>`;
  }

  function healthHtml() {
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

  function widgetLoadingHtml() {
    return `<section class="settings-card"><div class="settings-card-head"><h3>Widget</h3><p>Loading the corner widget settings…</p></div><div class="settings-card-body"><div class="empty">Preparing widget controls.</div></div></section>`;
  }

  async function loadWidgetSettings() {
    const section = document.getElementById("owner-widget-settings");
    if (!section) return;
    let settings = { corner: "bottom-right", margin: 12, scale: 1, visible: true, displayId: "primary", showUpload: false, displays: [{ id: "primary", label: "Primary display" }] };
    try { if (window.electronApp?.getDesktopSettings) settings = { ...settings, ...(await window.electronApp.getDesktopSettings()) }; } catch (_) {}
    section.innerHTML = `<section class="settings-card"><div class="settings-card-head"><h3>Widget</h3><p>Position and behaviour of the permanent Lumi speed widget</p></div><div class="settings-card-body"><form id="owner-widget-form">
      <div class="setting-row"><div class="setting-label"><strong>Widget position</strong><small>The widget stays inside the selected screen work area</small></div><select class="select" name="corner"><option value="bottom-right" ${settings.corner === "bottom-right" ? "selected" : ""}>Bottom right</option><option value="bottom-left" ${settings.corner === "bottom-left" ? "selected" : ""}>Bottom left</option><option value="top-right" ${settings.corner === "top-right" ? "selected" : ""}>Top right</option><option value="top-left" ${settings.corner === "top-left" ? "selected" : ""}>Top left</option></select></div>
      <div class="setting-row"><div class="setting-label"><strong>Display</strong><small>Choose which monitor owns the widget</small></div><select class="select" name="displayId">${(settings.displays || [{id:"primary",label:"Primary display"}]).map(display => `<option value="${safe(display.id)}" ${String(settings.displayId) === String(display.id) ? "selected" : ""}>${safe(display.label)}</option>`).join("")}</select></div>
      <div class="setting-row"><div class="setting-label"><strong>Edge margin</strong><small>Distance from the usable screen edge</small></div><input class="input" name="margin" type="number" min="4" max="80" value="${Number(settings.margin || 12)}"></div>
      <div class="setting-row"><div class="setting-label"><strong>Widget size</strong><small>Changes size proportionally without stretching the Lumi logo</small></div><select class="select" name="scale"><option value="0.85" ${Number(settings.scale) === .85 ? "selected" : ""}>Small</option><option value="1" ${Number(settings.scale || 1) === 1 ? "selected" : ""}>Normal</option><option value="1.15" ${Number(settings.scale) === 1.15 ? "selected" : ""}>Large</option></select></div>
      <label class="check ttg-switch"><span class="ttg-switch-copy"><strong>Show permanent speed widget</strong><small>Keep the compact Lumi widget available while the app is running.</small></span><input type="checkbox" name="visible" ${settings.visible !== false ? "checked" : ""}></label>
      <label class="check ttg-switch"><span class="ttg-switch-copy"><strong>Show upload speed while idle</strong><small>Include live upload usage when no download is active.</small></span><input type="checkbox" name="showUpload" ${settings.showUpload ? "checked" : ""}></label>
      <div class="form-actions"><button class="btn primary widget-save" type="submit">Save widget settings</button></div></form></div></section>`;
    section.querySelector("#owner-widget-form")?.addEventListener("submit", saveWidgetSettings);
  }

  async function saveWidgetSettings(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector(".widget-save");
    const value = { corner: form.elements.corner.value, displayId: form.elements.displayId.value, margin: Number(form.elements.margin.value || 12), scale: Number(form.elements.scale.value || 1), visible: form.elements.visible.checked, showUpload: form.elements.showUpload.checked };
    try {
      if (window.electronApp?.saveDesktopSettings) await window.electronApp.saveDesktopSettings(value);
      button.textContent = "Saved"; button.classList.add("saved");
      setTimeout(() => { button.textContent = "Save widget settings"; button.classList.remove("saved"); }, 2400);
    } catch (error) { if (typeof toast === "function") toast("Widget settings not saved", error.message, "error"); }
  }

  function onSettingsChange(event) {
    if (event.target.name === "download_notifications") localStorage.setItem(NOTIFY_KEY, String(event.target.checked));
  }

  function onSettingsSubmit(event) {
    if (event.target.dataset.form === "general-settings") {
      const toggle = event.target.closest(".settings-section")?.querySelector('[name="download_notifications"]');
      if (toggle) localStorage.setItem(NOTIFY_KEY, String(toggle.checked));
    }
  }

  async function onSettingsClick(event) {
    const browse = event.target.closest("[data-browse-target]");
    if (browse) { event.preventDefault(); return browseForFolder(browse.dataset.browseTarget, browse.closest("form")); }
  }

  async function browseForFolder(fieldName, form) {
    const input = form?.elements?.[fieldName];
    if (!input) return;
    try {
      const picker = window.electronApp?.chooseDirectory || window.electronApp?.selectDirectory || window.electronApp?.browseForFolder;
      if (picker) { const result = await picker(input.value || ""); const path = typeof result === "string" ? result : result?.path || result?.filePath; if (path) input.value = path; return; }
      const chooser = document.createElement("input"); chooser.type = "file"; chooser.webkitdirectory = true; chooser.hidden = true;
      chooser.addEventListener("change", () => { const first = chooser.files?.[0]; const full = first?.path || ""; if (full) { const relative = first.webkitRelativePath || first.name; input.value = full.slice(0, Math.max(0, full.length - relative.length)).replace(/[\\\/]$/, ""); } chooser.remove(); }, { once: true });
      document.body.appendChild(chooser); chooser.click();
      setTimeout(() => { if (chooser.isConnected && !chooser.files?.length) chooser.remove(); }, 30000);
      return;
    } catch (_) {}
    const chosen = window.prompt("Choose folder path:", input.value || "");
    if (chosen !== null) input.value = chosen;
  }

  function patchTitlebarAndMenus() {
    const brand = document.querySelector(".ttg-titlebar-brand");
    if (brand) brand.innerHTML = "<strong>THETECHGUY TOOL</strong>";
    const gear = document.getElementById("ttg-gear-menu");
    if (gear) {
      gear.innerHTML = `<div class="ttg-shell-menu-head"><strong>Lumi controls</strong><small>Settings, extension, updates and support</small></div>
        <button type="button" data-shell-action="settings"><span>⚙</span><span>Settings</span></button>
        <button type="button" data-owner-shell-action="extension"><span>▣</span><span>Browser extension</span></button>
        <button type="button" data-owner-shell-action="update"><span>↻</span><span>Check for updates</span></button>
        <button type="button" data-owner-shell-action="help"><span>?</span><span>Help / Report a bug</span></button>
        <button type="button" data-owner-shell-action="about"><span>ⓘ</span><span>About Lumi</span></button>`;
      gear.addEventListener("click", event => {
        const button = event.target.closest("[data-owner-shell-action]");
        if (!button) return;
        event.preventDefault(); event.stopImmediatePropagation(); closeShellMenus();
        handleOwnerShellAction(button.dataset.ownerShellAction);
      }, true);
    }
    const notificationMenu = document.getElementById("ttg-notification-menu");
    const head = notificationMenu?.querySelector(".ttg-shell-menu-head");
    if (notificationMenu && head && !notificationMenu.querySelector(".ttg-notification-pref")) {
      head.insertAdjacentHTML("afterend", `<label class="ttg-notification-pref"><span>Download complete notifications</span><input class="ttg-switch-input" id="owner-notification-switch" type="checkbox" ${notificationsEnabled() ? "checked" : ""}></label>`);
      notificationMenu.querySelector("#owner-notification-switch").addEventListener("change", event => { localStorage.setItem(NOTIFY_KEY, String(event.target.checked)); enforceNotificationPreference(); });
    }
    setInterval(enforceNotificationPreference, 900);
  }

  function bindGlobalPolishActions() {
    document.addEventListener("click", event => {
      const browse = event.target.closest("[data-browse-target]");
      if (browse && !browse.closest("#view-settings")) { event.preventDefault(); browseForFolder(browse.dataset.browseTarget, browse.closest("form")); }
      const action = event.target.closest("[data-owner-modal-action]")?.dataset.ownerModalAction;
      if (!action) return;
      if (action === "close") closeOwnerModal();
      if (action === "tools") openTools();
      if (action === "install-extension") { rememberExtensionChoice(); openTools("browser-extension"); closeOwnerModal(); }
      if (action === "not-now") { rememberExtensionChoice(); closeOwnerModal(); }
      if (action === "update-now") void installAvailableUpdate();
      if (action === "report-bug") openTools("report-bug");
    }, true);
  }

  function handleOwnerShellAction(action) {
    if (action === "extension") return showExtensionModal(false);
    if (action === "update") return void runUpdateCheck();
    if (action === "help") return showHelpModal();
    if (action === "about") return void showAboutModal();
  }

  function showExtensionModal(firstLaunch) {
    showOwnerModal(firstLaunch ? "Install the Lumi browser extension" : "Browser extension", `<p>${firstLaunch ? "Lumi can capture downloads directly from your browser." : "Install or manage the Lumi browser extension."}</p><div class="ttg-extension-choice"><button class="btn primary" data-owner-modal-action="install-extension">Chrome / Edge</button><button class="btn" data-owner-modal-action="install-extension">Firefox</button></div>${firstLaunch ? `<label class="check ttg-switch"><span class="ttg-switch-copy"><strong>Don't show this again</strong><small>You can always open Browser extension from the gear menu.</small></span><input type="checkbox" id="extension-dont-show"></label><div class="ttg-modal-actions"><button class="btn" data-owner-modal-action="not-now">Not now</button></div>` : `<p><small>The extension page will be published at the official Lumi tools page.</small></p>`}`);
  }

  function maybeShowExtensionPrompt() {
    if (!window.electronApp?.isElectron || localStorage.getItem(EXTENSION_PROMPT_KEY) === "true") return;
    setTimeout(() => showExtensionModal(true), 900);
  }

  function rememberExtensionChoice() {
    const box = document.getElementById("extension-dont-show");
    if (box?.checked) localStorage.setItem(EXTENSION_PROMPT_KEY, "true");
  }

  async function runUpdateCheck() {
    showOwnerModal("Check for updates", `<div class="ttg-update-state"><div class="ttg-status-ring loading"></div><strong>Checking for updates…</strong><p>Lumi is checking the official tools release information.</p></div>`);
    try {
      if (!window.electronApp?.checkForUpdates) throw new Error("The update service is not connected yet.");
      const result = await window.electronApp.checkForUpdates(true);
      if (result?.available) {
        showOwnerModal("Update available", `<div class="ttg-update-state"><div class="ttg-status-ring update">↓</div><strong>Lumi ${safe(result.version || "update")} is available</strong><p>${safe(result.message || "Download the update, close Lumi, install it and reopen the application.")}</p><div class="ttg-modal-actions"><button class="btn primary" data-owner-modal-action="update-now">Update now</button><button class="btn" data-owner-modal-action="close">Later</button></div></div>`);
      } else {
        showOwnerModal("Up to date", `<div class="ttg-update-state"><div class="ttg-status-ring success">✓</div><strong>Lumi is up to date</strong><p>${safe(result?.message || "No update is available for this version.")}</p><div class="ttg-modal-actions"><button class="btn" data-owner-modal-action="close">Close</button></div></div>`);
      }
    } catch (error) {
      showOwnerModal("Update check unavailable", `<div class="ttg-update-state"><div class="ttg-status-ring">!</div><strong>The tools update service is not ready yet</strong><p>${safe(error.message || "Check again after the Lumi page is fully published.")}</p><div class="ttg-modal-actions"><button class="btn" data-owner-modal-action="tools">Open tools page</button><button class="btn" data-owner-modal-action="close">Close</button></div></div>`);
    }
  }

  async function installAvailableUpdate() {
    const api = window.electronApp || {};
    const install = api.downloadAndInstallUpdate || api.installUpdate || api.applyUpdate || api.restartToUpdate || api.downloadUpdate;
    showOwnerModal("Installing update", `<div class="ttg-update-state"><div class="ttg-status-ring loading"></div><strong>Downloading update…</strong><p>Lumi will close, install the update and reopen automatically.</p></div>`);
    try { if (!install) throw new Error("Automatic installation will become available when the tools release service is published."); await install.call(api); }
    catch (error) { showOwnerModal("Update installation unavailable", `<p>${safe(error.message)}</p><div class="ttg-modal-actions"><button class="btn" data-owner-modal-action="tools">Open tools page</button><button class="btn" data-owner-modal-action="close">Close</button></div>`); }
  }

  function showHelpModal() {
    showOwnerModal("Help / Report a bug", `<h3>Need help with Lumi?</h3><p>Report a bug or ask for help on the official tools page through the Bonny assistant. Lumi can include a Tool Health error code when one is available.</p><div class="ttg-modal-actions"><button class="btn primary" data-owner-modal-action="report-bug">Open Bonny support</button><button class="btn" data-owner-modal-action="close">Close</button></div>`);
  }

  async function showAboutModal() {
    let info = { version: "development" };
    try { if (window.electronApp?.getAppInfo) info = { ...info, ...(await window.electronApp.getAppInfo()) }; } catch (_) {}
    showOwnerModal("About Lumi", `<div class="ttg-about-brand"><img src="/static/favicon-96.png" alt="Lumi"><div><strong>Lumi DM</strong><small>Version ${safe(info.version || "development")}</small></div></div><div class="ttg-about-lines"><p><strong>Lumi</strong> means <strong>Luminal Download Manager</strong>, inspired by luminal speed — the speed of light.</p><p>Made by the <strong>THETECHGUY TOOL Department</strong> from <strong>THETECHGUY DIGITAL SOLUTIONS</strong>.</p><p>Official page: <a href="${TOOLS_URL}" target="_blank" rel="noopener">thetechguyds.com/tools</a></p></div>`);
  }

  function showOwnerModal(title, html) {
    const modal = document.getElementById("ttg-shell-modal");
    if (!modal) return;
    const heading = document.getElementById("ttg-shell-modal-title");
    const body = document.getElementById("ttg-shell-modal-body");
    if (heading) heading.textContent = title;
    if (body) body.innerHTML = html;
    modal.hidden = false;
  }

  function closeOwnerModal() { const modal = document.getElementById("ttg-shell-modal"); if (modal) modal.hidden = true; }
  function closeShellMenus() { document.getElementById("ttg-gear-menu")?.setAttribute("hidden", ""); document.getElementById("ttg-notification-menu")?.setAttribute("hidden", ""); document.getElementById("ttg-gear")?.classList.remove("active"); document.getElementById("ttg-bell")?.classList.remove("active"); }
  function appState() { try { return typeof state !== "undefined" ? state : {}; } catch (_) { return {}; } }
  function notificationsEnabled() { return localStorage.getItem(NOTIFY_KEY) !== "false"; }
  function enforceNotificationPreference() {
    const enabled = notificationsEnabled();
    const items = [...document.querySelectorAll("#ttg-notification-list .ttg-notification-item")];
    for (const item of items) { const completed = Boolean(item.querySelector(".ttg-notification-dot.completed")); item.hidden = !enabled && completed; }
    if (!enabled) { const visible = items.filter(item => !item.hidden).length; const badge = document.getElementById("ttg-bell-badge"); if (badge) { badge.textContent = visible > 99 ? "99+" : String(visible); badge.hidden = visible === 0; } }
  }
  function openTools(hash = "") { const url = hash ? `${TOOLS_URL}#${hash}` : TOOLS_URL; if (window.electronApp?.openExternal) window.electronApp.openExternal(url); else window.open(url, "_blank", "noopener"); }
  function safe(value) { return String(value ?? "").replace(/[&<>'"]/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" }[ch])); }
})();
