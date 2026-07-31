"use strict";
(() => {
  const PREFS_KEY = "LUMI.approved.settings.v2";
  const defaults = Object.freeze({
    startAtLogin: false, startMinimized: true, desktopNotifications: true,
    completionSound: true, errorNotifications: true, queueNotifications: false,
    globalSpeedLimit: false, clipboardMonitoring: true, browserCapture: true,
    internetCapture: true, defaultCategory: "", defaultQueue: "default",
    duplicatePolicy: "rename", maxDownloadSpeed: 0, maxUploadSpeed: 0,
  });
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const readPrefs = () => { try { return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") }; } catch (_) { return { ...defaults }; } };
  const writePrefs = value => { const next = { ...defaults, ...(value || {}) }; localStorage.setItem(PREFS_KEY, JSON.stringify(next)); return next; };
  let prefs = readPrefs();
  let extensionClients = [];
  let pairing = null;

  function api(method, path, body = null) {
    if (window.LumiProductionIntegration?.api) return window.LumiProductionIntegration.api(method, path, body);
    return fetch(path, { method, credentials: "same-origin", headers: body === null ? {} : {"Content-Type":"application/json"}, ...(body === null ? {} : {body:JSON.stringify(body)}) }).then(async response => {
      const value = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(value.error || `${method} ${path} failed`);
      return value;
    });
  }

  function toast(message, type = "good") {
    if (typeof window.toast === "function") window.toast(message, type);
  }

  const preferenceRows = new Map([
    ["Launch Lumi on system startup", "startAtLogin"],
    ["Start minimized to system tray", "startMinimized"],
    ["Global download speed limit", "globalSpeedLimit"],
    ["Show desktop notifications", "desktopNotifications"],
    ["Play sound on download complete", "completionSound"],
    ["Notify on download errors", "errorNotifications"],
    ["Notify on queue completion", "queueNotifications"],
    ["Clipboard monitoring", "clipboardMonitoring"],
    ["Capture downloads from browsers", "browserCapture"],
    ["Internet download capture", "internetCapture"],
  ]);

  function patchSettings() {
    if (window.LumiReplica?.state?.view !== "settings") return;
    for (const row of $$(".setting-row")) {
      const label = row.firstElementChild?.textContent?.trim() || row.textContent.trim();
      const entry = [...preferenceRows].find(([name]) => label.startsWith(name));
      const toggle = row.querySelector("[data-toggle]");
      if (entry && toggle) {
        toggle.dataset.releasePref = entry[1];
        toggle.classList.toggle("on", Boolean(prefs[entry[1]]));
      }
    }
    const connections = $("#default-connections");
    if (connections && (!connections.value || Number(connections.value) === 16) && !window.LumiReplica.state.settings?.default_connections) connections.value = "32";
    const values = {
      "#default-category": prefs.defaultCategory,
      "#default-queue": prefs.defaultQueue,
      "#duplicate-policy": prefs.duplicatePolicy,
      "#max-download-speed": prefs.maxDownloadSpeed,
      "#max-upload-speed": prefs.maxUploadSpeed,
    };
    for (const [selector, value] of Object.entries(values)) { const control = $(selector); if (control && value !== undefined) control.value = value; }
  }

  function clientKind(client) {
    const text = `${client?.client_name || ""} ${client?.name || ""}`.toLowerCase();
    if (text.includes("edge")) return "edge";
    if (text.includes("chrome") || text.includes("chromium") || text.includes("browser extension")) return "chrome";
    return "";
  }

  function browserCard(type, name, status) {
    const connected = status === "Connected";
    const available = status === "Available";
    const icon = type === "chrome" ? "C" : type === "edge" ? "e" : "F";
    const actions = type === "firefox"
      ? '<button class="btn" disabled>Not available yet</button>'
      : `<button class="btn ${available ? "primary" : ""}" data-release-extension-package="${type}">${available ? "Prepare Extension" : "Open Package"}</button><button class="btn ${connected ? "" : "primary"}" data-release-pair-extension="${type}">${connected ? "Pair Another Browser" : "Generate Pairing Code"}</button>`;
    return `<article class="browser-card"><div class="browser-top"><div class="browser-logo ${type}">${icon}</div><div class="browser-copy"><h3>${name}</h3><span class="status-pill ${connected ? "completed" : available ? "downloading" : ""}">${status}</span><p>${type === "firefox" ? "No verified package" : "Chromium extension 1.2.0"}</p><p>${connected ? "Authenticated local capture" : available ? "Package included with Lumi" : "Not shipped"}</p></div></div><div class="browser-actions">${actions}</div></article>`;
  }

  function patchExtension() {
    if (window.LumiReplica?.state?.view !== "browser-extension") return;
    const content = $("#content");
    if (!content) return;
    const chrome = extensionClients.some(client => clientKind(client) === "chrome") ? "Connected" : "Available";
    const edge = extensionClients.some(client => clientKind(client) === "edge") ? "Connected" : "Available";
    const grid = $(".extension-browser-grid", content);
    if (grid) grid.innerHTML = `${browserCard("chrome", "Google Chrome", chrome)}${browserCard("edge", "Microsoft Edge", edge)}${browserCard("firefox", "Mozilla Firefox", "Unavailable")}`;
    let pairingPanel = $("[data-release-pairing-panel]", content);
    if (pairing) {
      if (!pairingPanel) {
        pairingPanel = document.createElement("section"); pairingPanel.className = "panel"; pairingPanel.dataset.releasePairingPanel = ""; pairingPanel.style.marginTop = "16px"; content.querySelector(".page")?.appendChild(pairingPanel);
      }
      pairingPanel.innerHTML = `<div class="panel-head"><h2>ONE-TIME PAIRING CODE</h2></div><div style="padding:22px;text-align:center"><div style="font-size:38px;letter-spacing:10px;font-weight:800">${esc(pairing.code || pairing.pairing_code || "")}</div><p style="color:#9ea9bc">Enter this code in the Lumi Chrome or Edge extension. It expires automatically.</p></div>`;
    }
  }

  async function refreshExtension() {
    try { const value = await api("GET", "/api/v4/security/clients"); extensionClients = Array.isArray(value.clients) ? value.clients : []; }
    catch (_) { extensionClients = []; }
    patchExtension();
  }

  function patchRenderer() {
    const replica = window.LumiReplica;
    if (!replica || replica.__releaseGatePatched) return;
    replica.__releaseGatePatched = true;
    const render = replica.render.bind(replica);
    replica.render = function releaseGateRender() { render(); patchSettings(); patchExtension(); };
    window.render = replica.render;
    const switchView = replica.switchView.bind(replica);
    replica.switchView = function releaseGateSwitch(view) { switchView(view); if (view === "browser-extension") void refreshExtension(); };
    window.switchView = replica.switchView;
    replica.state.approvedPrefs = prefs;
    if (!replica.state.settings?.default_connections) replica.state.settings.default_connections = 32;
    replica.render();
  }

  async function resetDefaults() {
    prefs = writePrefs(defaults);
    localStorage.setItem("lumi.theme", "dark");
    if (window.LumiReplica) window.LumiReplica.state.theme = "dark";
    await Promise.all([
      api("POST", "/api/settings/connections", {value:32}),
      api("POST", "/api/settings/concurrent", {value:8}),
      window.electronApp?.saveDesktopSettings?.({startAtLogin:false}) || Promise.resolve(),
    ]);
    await window.LumiProductionIntegration?.refreshLive?.({full:true,renderAfter:true});
    window.LumiReplica?.render();
    toast("Lumi defaults restored · 32 connections");
  }

  function exportSettings() {
    const payload = {schema:2,exportedAt:new Date().toISOString(),preferences:prefs,transfer:{default_connections:Number(window.LumiReplica?.state?.settings?.default_connections || 32),max_concurrent:Number(window.LumiReplica?.state?.settings?.max_concurrent || 8),default_dir:window.LumiReplica?.state?.settings?.default_dir || ""}};
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}));
    const link = document.createElement("a"); link.href=url; link.download="Lumi-settings.json"; link.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); toast("Settings exported");
  }

  function importSettings() {
    const input=document.createElement("input"); input.type="file"; input.accept=".json,application/json";
    input.onchange=async()=>{try{const value=JSON.parse(await input.files[0].text());if(Number(value.schema)!==2)throw new Error("Unsupported Lumi settings file");prefs=writePrefs(value.preferences);const transfer=value.transfer||{};await Promise.all([api("POST","/api/settings/connections",{value:Number(transfer.default_connections||32)}),api("POST","/api/settings/concurrent",{value:Number(transfer.max_concurrent||8)}),transfer.default_dir?api("POST","/api/settings/default-dir",{dir:transfer.default_dir}):Promise.resolve(),window.electronApp?.saveDesktopSettings?.({startAtLogin:Boolean(prefs.startAtLogin)})||Promise.resolve()]);await window.LumiProductionIntegration?.refreshLive?.({full:true,renderAfter:true});window.LumiReplica?.render();toast("Settings imported");}catch(error){toast(error.message||"Settings import failed","bad");}};input.click();
  }

  document.addEventListener("click", async event => {
    const toggle = event.target.closest("[data-release-pref]");
    if (toggle) {
      const key=toggle.dataset.releasePref; setTimeout(async()=>{prefs=writePrefs({...prefs,[key]:toggle.classList.contains("on")});if(key==="startAtLogin")await window.electronApp?.saveDesktopSettings?.({startAtLogin:prefs.startAtLogin});},0); return;
    }
    if (event.target.closest("[data-test-network]")) { event.preventDefault(); event.stopImmediatePropagation(); window.openSpeedTest?.(); await window.runSpeedTest?.(); return; }
    if (event.target.closest("[data-export-settings]")) { event.preventDefault(); event.stopImmediatePropagation(); exportSettings(); return; }
    if (event.target.closest("[data-import-settings]")) { event.preventDefault(); event.stopImmediatePropagation(); importSettings(); return; }
    if (event.target.closest("[data-reset-settings], [data-restore-defaults]")) { event.preventDefault(); event.stopImmediatePropagation(); try{await resetDefaults();}catch(error){toast(error.message,"bad");} return; }
    const packageButton=event.target.closest("[data-release-extension-package]");
    if(packageButton){event.preventDefault();event.stopImmediatePropagation();try{await window.electronApp.prepareBrowserExtension();toast(`${packageButton.dataset.releaseExtensionPackage === "edge" ? "Edge" : "Chrome"} extension package opened`);}catch(error){toast(error.message,"bad");}return;}
    const pairButton=event.target.closest("[data-release-pair-extension]");
    if(pairButton){event.preventDefault();event.stopImmediatePropagation();try{pairing=await api("POST","/api/v4/security/pairing",{role:"owner",client_name:`Lumi ${pairButton.dataset.releasePairExtension === "edge" ? "Edge" : "Chrome"} Extension`,expires_in:600});patchExtension();toast("One-time pairing code generated");}catch(error){toast(error.message,"bad");}return;}
  }, true);

  document.addEventListener("change", event => {
    const map={"default-category":"defaultCategory","default-queue":"defaultQueue","duplicate-policy":"duplicatePolicy","max-download-speed":"maxDownloadSpeed","max-upload-speed":"maxUploadSpeed"};
    const key=map[event.target.id]; if(key){prefs=writePrefs({...prefs,[key]:event.target.type==="number"?Number(event.target.value||0):event.target.value});if(window.LumiReplica)window.LumiReplica.state.approvedPrefs=prefs;}
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", patchRenderer, {once:true}); else patchRenderer();
})();
