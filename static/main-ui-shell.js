"use strict";
(() => {
  const UI = window.LumiMainUI;
  const { EXTENSION_PROMPT_KEY, NOTIFY_KEY, TOOLS_URL, BRAND, h, number } = UI;
  function bindPrimaryActions() {
    document.addEventListener("click", event => {
      const newButton = event.target.closest("[data-main-open-new]");
      if (newButton) { event.preventDefault(); if (typeof openNewModal === "function") openNewModal(); return; }
      const viewButton = event.target.closest("[data-main-view]");
      if (viewButton) { event.preventDefault(); if (typeof switchView === "function") switchView(viewButton.dataset.mainView); return; }
      const taskButton = event.target.closest("[data-main-task-action]");
      if (taskButton) { event.preventDefault(); if (typeof handleTaskAction === "function") void handleTaskAction(taskButton.dataset.mainTaskAction, taskButton.dataset.task); return; }
      const queueOne = event.target.closest("[data-main-queue-one]");
      if (queueOne) {
        event.preventDefault();
        document.querySelectorAll("[data-grab-index]").forEach(box => box.checked = number(box.dataset.grabIndex) === number(queueOne.dataset.mainQueueOne));
        if (typeof queueGrabbed === "function") void queueGrabbed();
        return;
      }
      const tab = event.target.closest("[data-main-settings-tab]");
      if (tab) {
        event.preventDefault();
        const key = tab.dataset.mainSettingsTab;
        document.querySelectorAll("[data-main-settings-tab]").forEach(button => button.classList.toggle("active", button === tab));
        document.querySelectorAll("[data-main-settings-section]").forEach(section => section.classList.toggle("active", section.dataset.mainSettingsSection === key));
        if (key === "security" && typeof loadPairedClients === "function") void loadPairedClients();
        return;
      }
      const browse = event.target.closest("[data-main-browse]");
      if (browse) { event.preventDefault(); void chooseFolder(browse.dataset.mainBrowse, browse.closest("form")); return; }
      if (event.target.closest("[data-main-health-check]")) { event.preventDefault(); void runToolHealth(); return; }
      const customShell = event.target.closest("[data-main-shell-action]");
      if (customShell) { event.preventDefault(); event.stopImmediatePropagation(); handleMainShellAction(customShell.dataset.mainShellAction); }
    }, true);
    document.addEventListener("change", event => {
      if (event.target.name === "download_notifications") localStorage.setItem(NOTIFY_KEY, String(event.target.checked));
    }, true);
  }

  async function chooseFolder(fieldName, form) {
    const input = form?.elements?.[fieldName];
    if (!input) return;
    try {
      const result = await window.electronApp?.pickFolder?.();
      if (result) input.value = result;
    } catch (error) { if (typeof toast === "function") toast("Folder not selected", error.message, "error"); }
  }

  async function runToolHealth() {
    const host = document.getElementById("lumi-health-result");
    if (!host) return;
    host.innerHTML = '<div class="lumi-health-ring running">•</div><strong>Checking Lumi…</strong><p>Running one overall health check.</p>';
    try {
      const result = await api("GET", "/api/v4/diagnostics");
      const healthy = result?.database?.ok !== false && result?.storage?.ok !== false && !number(result?.missing_files?.missing_count);
      if (healthy) host.innerHTML = '<div class="lumi-health-ring good">✓</div><strong>Lumi is healthy</strong><p>No error code is required.</p><button class="btn" type="button" data-main-health-check>Check again</button>';
      else {
        const code = `LUMI-HLTH-${result?.database?.ok === false ? "DB" : result?.storage?.ok === false ? "STORAGE" : "FILES"}-01`;
        host.innerHTML = `<div class="lumi-health-ring bad">!</div><strong>Lumi needs attention</strong><p>Use this code when reporting the problem through Bonny.</p><code class="lumi-health-code">${h(code)}</code><button class="btn primary" type="button" data-main-shell-action="help">Report a bug</button><button class="btn" type="button" data-main-health-check>Check again</button>`;
      }
    } catch (error) {
      host.innerHTML = `<div class="lumi-health-ring bad">!</div><strong>Health check failed</strong><p>${h(error.message || error)}</p><code class="lumi-health-code">LUMI-HLTH-CHECK-01</code><button class="btn primary" type="button" data-main-shell-action="help">Report a bug</button><button class="btn" type="button" data-main-health-check>Try again</button>`;
    }
  }

  function patchGearMenu() {
    const gear = document.getElementById("ttg-gear-menu");
    if (!gear) return;
    gear.innerHTML = `<div class="ttg-shell-menu-head"><strong>Lumi controls</strong><small>Settings, speed, updates and support</small></div>
      <button type="button" data-shell-action="settings"><span>⚙</span><span>Settings</span></button>
      <button type="button" data-shell-action="speed-test"><span>↯</span><span>Speed Test</span></button>
      <button type="button" data-main-shell-action="extension"><span>▣</span><span>Browser Extension</span></button>
      <button type="button" data-shell-action="update"><span>↻</span><span>Check for Updates</span></button>
      <button type="button" data-main-shell-action="help"><span>?</span><span>Help / Report a Bug</span></button>
      <button type="button" data-main-shell-action="about"><span>ⓘ</span><span>About Lumi</span></button>`;
  }

  function patchNotificationSwitch() {
    const menu = document.getElementById("ttg-notification-menu");
    const head = menu?.querySelector(".ttg-shell-menu-head");
    if (!menu || !head || menu.querySelector(".lumi-notification-pref")) return;
    const enabled = localStorage.getItem(NOTIFY_KEY) !== "false";
    head.insertAdjacentHTML("afterend", `<label class="lumi-notification-pref" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 14px;border-bottom:1px solid rgba(255,255,255,.06)"><span style="font-size:11px">Download complete notifications</span><span class="lumi-switch"><input type="checkbox" id="lumi-notification-switch" ${enabled ? "checked" : ""}></span></label>`);
    menu.querySelector("#lumi-notification-switch")?.addEventListener("change", event => localStorage.setItem(NOTIFY_KEY, String(event.target.checked)));
  }

  function handleMainShellAction(action) {
    closeShellMenus();
    if (action === "extension") return showExtensionNotice(false);
    if (action === "help") return showMainModal("Help / Report a Bug", `<h3>Need help with Lumi?</h3><p>Report a bug or ask for help on the official tools page through the Bonny assistant.</p><div class="ttg-modal-actions"><button class="btn primary" id="lumi-open-support">Open Bonny Support</button><button class="btn" id="lumi-modal-close">Close</button></div>`);
    if (action === "about") return showAbout();
  }

  function showAbout() {
    const versionPromise = window.electronApp?.getAppInfo?.() || Promise.resolve({ version: "development" });
    void Promise.resolve(versionPromise).then(info => showMainModal("About Lumi", `<div class="ttg-about-brand"><img src="/static/favicon-96.png" alt="Lumi"><div><strong>Lumi DM</strong><small>Version ${h(info?.version || "development")}</small></div></div><p><strong>Lumi</strong> means <strong>Luminal Download Manager</strong>, inspired by luminal speed—the speed of light.</p><p>Made by the <strong>THETECHGUY TOOL Department</strong> from <strong>THETECHGUY DIGITAL SOLUTIONS</strong>.</p><p>Official page: <a href="${TOOLS_URL}" target="_blank" rel="noopener">thetechguyds.com/tools</a></p>`));
  }

  function maybeShowExtensionNotice() {
    // Browser Extension remains available from the gear menu. Do not place a
    // modal over the application on first launch, especially while the
    // extension package is not bundled in the release.
  }

  function showExtensionNotice(firstLaunch) {
    showMainModal("Browser Extension", `<h3>${firstLaunch ? "Browser capture setup" : "Lumi browser extension"}</h3><p>The extension package is not bundled in this build yet. Lumi will not pretend to install it. When the package is published, this control will install or open the verified extension from the official tools page.</p>${firstLaunch ? '<label class="lumi-switch"><span class="lumi-setting-copy"><strong>Don\'t show this again</strong><small>You can open Browser Extension from the gear menu.</small></span><input type="checkbox" id="lumi-extension-dismiss"></label>' : ""}<div class="ttg-modal-actions"><button class="btn primary" id="lumi-open-tools">Open Tools Page</button><button class="btn" id="lumi-modal-close">Close</button></div>`);
  }

  function showMainModal(title, html) {
    const modal = document.getElementById("ttg-shell-modal");
    const heading = document.getElementById("ttg-shell-modal-title");
    const body = document.getElementById("ttg-shell-modal-body");
    if (!modal || !heading || !body) return;
    heading.textContent = title;
    body.innerHTML = html;
    modal.hidden = false;
    body.querySelector("#lumi-modal-close")?.addEventListener("click", closeMainModal);
    body.querySelector("#lumi-open-tools")?.addEventListener("click", () => { rememberExtensionDismiss(); openExternal(TOOLS_URL); closeMainModal(); });
    body.querySelector("#lumi-open-support")?.addEventListener("click", () => { openExternal(`${TOOLS_URL}#report-bug`); closeMainModal(); });
  }

  function rememberExtensionDismiss() {
    if (document.getElementById("lumi-extension-dismiss")?.checked) localStorage.setItem(EXTENSION_PROMPT_KEY, "true");
  }

  function closeMainModal() {
    rememberExtensionDismiss();
    const modal = document.getElementById("ttg-shell-modal");
    if (modal) modal.hidden = true;
  }

  function closeShellMenus() {
    document.getElementById("ttg-gear-menu")?.setAttribute("hidden", "");
    document.getElementById("ttg-notification-menu")?.setAttribute("hidden", "");
    document.getElementById("ttg-gear")?.classList.remove("active");
    document.getElementById("ttg-bell")?.classList.remove("active");
  }

  function openExternal(url) {
    if (window.electronApp?.openExternal) window.electronApp.openExternal(url);
    else window.open(url, "_blank", "noopener");
  }

  function installActualBrandLogos() {
    const apply = () => {
      document.querySelectorAll("[data-os-family]").forEach(button => {
        const family = button.dataset.osFamily;
        const host = button.querySelector(".os-platform-icon");
        if (!host) return;
        const source = family === "Windows" ? BRAND.windows : family === "macOS" ? BRAND.apple : BRAND.linux;
        host.innerHTML = `<img src="${source}" alt="${h(family)}">`;
      });
      document.querySelectorAll("#view-firmware .firmware-card").forEach(card => {
        const text = card.textContent.toLowerCase();
        const host = card.querySelector(".firmware-source-icon");
        if (!host) return;
        const source = text.includes("apple") || text.includes("iphone") || text.includes("ipad") ? BRAND.apple : text.includes("android") || text.includes("samsung") || text.includes("xiaomi") || text.includes("oppo") || text.includes("vivo") ? BRAND.android : BRAND.lumi;
        host.innerHTML = `<img src="${source}" alt="">`;
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    [document.getElementById("view-operating_systems"), document.getElementById("view-firmware")].filter(Boolean).forEach(view => observer.observe(view, { childList: true, subtree: true }));
  }
  Object.assign(UI, { bindPrimaryActions, patchGearMenu, patchNotificationSwitch, maybeShowExtensionNotice, installActualBrandLogos });
})();
