"use strict";

/* Lumi V5 UI: firmware catalogue, adaptive desktop controls and quiet promotions. */
const v5State = {
  catalogue: null,
  devices: [],
  results: [],
  loading: false,
  desktop: null,
  platform: sessionStorage.getItem("LUMI.firmwarePlatform") || "Android",
};

try { viewMeta.firmware = ["Firmware", "Official OS, custom builds and technician source evidence"]; } catch (_) {}

window.addEventListener("DOMContentLoaded", () => {
  document.querySelector('[data-view="firmware"]')?.addEventListener("click", () => {
    setTimeout(() => void openFirmwareView(), 0);
  });
  document.getElementById("view-firmware")?.addEventListener("submit", handleFirmwareSubmit);
  document.getElementById("view-firmware")?.addEventListener("click", handleFirmwareClick);
  document.getElementById("view-firmware")?.addEventListener("change", handleFirmwareChange);
  document.getElementById("hunter-promo")?.addEventListener("click", openPromotion);
  observeSettings();
  void loadPromotion();
});

function v5Headers(body = false) {
  const headers = { "X-Lumi-Client": "web-ui-v5" };
  if (body) headers["Content-Type"] = "application/json";
  const token = sessionStorage.getItem("LUMI.bearerToken") || "";
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function v5Api(method, path, body = null) {
  const response = await fetch(path, {
    method,
    credentials: sessionStorage.getItem("LUMI.bearerToken") ? "omit" : "same-origin",
    headers: v5Headers(body !== null),
    ...(body !== null ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; }
  catch { data = { error: text.slice(0, 500) }; }
  if (!response.ok) throw new Error(data.error || `${method} ${path} failed (${response.status})`);
  return data;
}

async function openFirmwareView() {
  try {
    if (typeof switchView === "function") switchView("firmware");
  } catch (_) {
    document.querySelectorAll(".view").forEach(view => view.classList.toggle("active", view.id === "view-firmware"));
  }
  await ensureFirmwareCatalogue();
  renderFirmware();
}

async function ensureFirmwareCatalogue() {
  if (v5State.catalogue) return;
  try {
    v5State.catalogue = await v5Api("GET", "/api/v5/firmware/catalogue");
  } catch (error) {
    v5State.catalogue = { brands: [], providers: [], warning: error.message };
  }
}

function renderFirmware() {
  const element = document.getElementById("view-firmware");
  if (!element) return;
  const catalogue = v5State.catalogue || { brands: [], providers: [] };
  const apple = v5State.platform === "Apple";
  const brands = (catalogue.brands || []).filter(value => apple ? /apple/i.test(value) : !/apple/i.test(value));
  element.innerHTML = `<div class="approved-page approved-firmware-page firmware-shell">
    <div class="approved-page-head"><div><h2>Mobile Firmware</h2><p>Download official ROMs, OTA packages, flash files, and IPSW for your devices.</p></div></div>
    <div class="approved-platform-tabs firmware-platform-tabs">
      <button type="button" class="${apple ? "" : "active"}" data-firmware-action="platform" data-platform="Android"><span>●</span> Android</button>
      <button type="button" class="${apple ? "active" : ""}" data-firmware-action="platform" data-platform="Apple"><span>●</span> iPhone / iPad</button>
    </div>
    <form class="approved-tech-filters approved-firmware-filters" id="firmware-search-form-v7">
      <label>Brand<select class="select" name="brand" id="lumi-firmware-brand" required><option value="">Select brand</option>${brands.map(value => `<option value="${v5Esc(value)}">${v5Esc(value)}</option>`).join("")}</select></label>
      <label>Model<input class="input" name="device" id="lumi-firmware-model" list="lumi-firmware-model-list" placeholder="Select brand first" autocomplete="off" disabled required><datalist id="lumi-firmware-model-list"></datalist></label>
      <label>Source<select class="select" name="provider" id="lumi-firmware-source" disabled><option value="all">Select model first</option></select></label>
      <label>Channel<select class="select" name="channel"><option value="all">Stable + beta</option><option value="stable">Stable</option><option value="beta">Beta / preview</option><option value="nightly">Nightly</option><option value="official">Official</option><option value="community">Community</option></select></label>
      <label>Region<select class="select" name="region"><option value="all">All</option><option>Global</option><option>Europe</option><option>India</option><option>China</option><option>USA</option></select></label>
      <label>Type<select class="select" name="package_type"><option value="all">All</option><option value="official">Official ROM</option><option value="ota">OTA Update</option><option value="flash">Flash File</option><option value="ipsw">IPSW</option></select></label>
      <label class="approved-tech-search">Search firmware<input class="input" name="query" type="search" placeholder="version, build, region or file type"></label>
      <label class="approved-firmware-community"><input type="checkbox" name="include_community" checked> Community</label>
      <div class="approved-tech-actions"><button class="approved-btn primary" type="submit">⌕ Search</button><button class="approved-btn" type="button" data-firmware-action="clear">Clear</button></div>
    </form>
    <div id="firmware-results" class="approved-tech-results">${firmwareResultsHtml()}</div>
  </div>`;
}
function groupProviders(providers) {
  const groups = {};
  for (const provider of providers) (groups[provider.group] ||= []).push(provider);
  return Object.entries(groups).map(([group, values]) => `<optgroup label="${v5Esc(group)}">${values.map(provider => `<option value="${v5Esc(provider.id)}">${v5Esc(provider.name)}</option>`).join("")}</optgroup>`).join("");
}

function deviceOptions() {
  return v5State.devices.map(item => `<option value="${v5Esc(item.id)}">${v5Esc(item.name)}${item.codename && item.codename !== item.id ? ` · ${v5Esc(item.codename)}` : ""}</option>`).join("");
}

function firmwareResultsHtml() {
  if (v5State.loading) return `<section class="approved-dense-table approved-firmware-table"><div class="approved-empty"><strong>Searching public firmware sources…</strong></div></section>`;
  return `<section class="approved-dense-table approved-firmware-table"><div class="approved-table-head"><span>Device</span><span>Build / Version</span><span>Region</span><span>Package Type</span><span>Size</span><span>Release Date</span><span>Signing / Status</span><span>Action</span></div><div class="approved-table-body">${v5State.results.length ? v5State.results.map(firmwareCard).join("") : `<div class="approved-empty"><strong>No firmware results yet</strong><span>Select a platform, brand/model, then search official sources.</span></div>`}</div><div class="approved-table-foot"><span>${v5State.results.length} result${v5State.results.length === 1 ? "" : "s"}</span><span>Verify exact model and region before flashing.</span></div></section>`;
}
function isActionableFirmware(item) {
  return Boolean(item?.direct && item?.url) || item?.metadata?.resolver === "samsung-fus";
}
function firmwareCard(item) {
  if (!isActionableFirmware(item)) return "";
  const index = v5State.results.indexOf(item);
  const region = item.region || item.metadata?.region || item.metadata?.market || "Global";
  const packageType = item.file_type || (item.official ? "Official ROM" : "Community");
  const device = item.device || item.model || item.brand || "Device";
  const version = [item.build, item.version].filter(Boolean).join(" · ") || item.title || "—";
  const status = item.signed === true ? "✓ Signed" : item.signed === false ? "Unsigned" : item.official ? "✓ Official" : item.sha256 ? "✓ SHA-256" : item.metadata?.resolver === "samsung-fus" ? "Samsung" : "Source";
  const action = `<button class="approved-icon-action primary" type="button" data-firmware-action="download" data-index="${index}" title="Download">↓</button>`;
  return `<div class="approved-table-row approved-firmware-row"><div class="approved-file-cell"><img src="${/apple|iphone|ipad/i.test(`${item.brand} ${device}`) ? "/static/brand/apple.svg" : "/static/brand/android.svg"}" alt=""><span><strong>${v5Esc(device)}</strong><small>${v5Esc(item.brand || item.source_name || "")}</small></span></div><span title="${v5Esc(version)}">${v5Esc(version)}</span><span>${v5Esc(region)}</span><span class="approved-package-type">${v5Esc(packageType)}</span><span>${item.size ? v5FmtBytes(item.size) : "—"}</span><span>${v5Esc(item.release_date || "—")}</span><span class="${item.signed === false ? "approved-bad" : "approved-verified"}">${v5Esc(status)}</span><span class="approved-actions">${action}</span></div>`;
}

async function handleFirmwareSubmit(event) {
  if (event.target.id !== "firmware-search-form") return;
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.target).entries());
  data.include_community = event.target.elements.include_community.checked;
  v5State.loading = true;
  document.getElementById("firmware-results").innerHTML = firmwareResultsHtml();
  try {
    const params = new URLSearchParams({
      provider: data.provider || "all", brand: data.brand || "", device: data.device || "",
      query: data.query || "", channel: data.channel || "all",
      include_community: data.include_community ? "true" : "false",
    });
    const response = await v5Api("GET", `/api/v5/firmware/search?${params}`);
    let results = (response.results || []).filter(isActionableFirmware);
    results = results.filter(item => v5State.platform === "Apple" ? /apple|iphone|ipad|ipsw/i.test(`${item.brand} ${item.device} ${item.file_type}`) : !/apple|iphone|ipad|ipsw/i.test(`${item.brand} ${item.device} ${item.file_type}`));
    if (data.region && data.region !== "all") results = results.filter(item => `${item.region || item.metadata?.region || item.metadata?.market || ""}`.toLowerCase().includes(data.region.toLowerCase()));
    if (data.package_type && data.package_type !== "all") results = results.filter(item => `${item.file_type || ""}`.toLowerCase().includes(data.package_type.toLowerCase()) || (data.package_type === "official" && item.official));
    v5State.results = results;
  } catch (error) {
    v5Toast("Firmware search failed", error.message, "error");
    v5State.results = [];
  } finally {
    v5State.loading = false;
    document.getElementById("firmware-results").innerHTML = firmwareResultsHtml();
  }
}

async function handleFirmwareChange(event) {
  if (!event.target.matches("#firmware-brand,#firmware-provider")) return;
  const form = document.getElementById("firmware-search-form");
  if (!form) return;
  const params = new URLSearchParams({ brand: form.elements.brand.value, provider: form.elements.provider.value, query: "" });
  try {
    const response = await v5Api("GET", `/api/v5/firmware/devices?${params}`);
    v5State.devices = response.devices || [];
    document.getElementById("firmware-device-list").innerHTML = deviceOptions();
  } catch (_) { v5State.devices = []; }
}

async function handleFirmwareClick(event) {
  const button = event.target.closest("[data-firmware-action]");
  if (!button) return;
  const action = button.dataset.firmwareAction;
  if (action === "platform") {
    v5State.platform = button.dataset.platform === "Apple" ? "Apple" : "Android";
    sessionStorage.setItem("LUMI.firmwarePlatform", v5State.platform);
    v5State.results = []; v5State.devices = []; renderFirmware(); return;
  }
  if (action === "clear") {
    v5State.results = [];
    v5State.devices = [];
    renderFirmware();
    return;
  }
  const item = v5State.results[Number(button.dataset.index)];
  if (!isActionableFirmware(item)) return;
  if (action === "download") {
    if (item.metadata?.resolver === "samsung-fus") await stageSamsungFirmware(item, button);
    else await stageFirmware(item, button);
  }
}

async function stageSamsungFirmware(item, button) {
  const model = String(item.metadata?.model || item.device || "").trim().toUpperCase();
  const cscValue = window.prompt(`Samsung CSC for ${model}:\n\nEnter the exact 3-character CSC, for example EUX, XFA or XFE.`, "");
  if (cscValue === null) return;
  const csc = String(cscValue).trim().toUpperCase();
  if (!/^[A-Z0-9]{3}$/.test(csc)) {
    v5Toast("Invalid Samsung CSC", "Enter the exact 3-character Samsung CSC.", "error");
    return;
  }
  const defaultDir = (typeof state !== "undefined" && state.settings?.default_dir) || "";
  const targetDir = window.prompt("Save firmware to:", defaultDir || "") ?? null;
  if (targetDir === null) return;
  button.disabled = true;
  try {
    const task = await v5Api("POST", "/api/v5/firmware/samsung/stage", { model, csc, target_dir: targetDir, connections: 0 });
    await v5Api("POST", `/api/downloads/${encodeURIComponent(task.id)}/confirm`, {
      filename: task.filename, target_dir: targetDir, connections: 0,
    });
    if (typeof refreshFoundation === "function") await refreshFoundation();
    v5Toast("Firmware queued", task.filename || model, "success");
    if (typeof switchView === "function") switchView("downloads");
  } catch (error) {
    v5Toast("Firmware not queued", error.message, "error");
  } finally { button.disabled = false; }
}

async function stageFirmware(item, button) {
  const details = [item.brand, item.device, item.version, item.build, item.channel].filter(Boolean).join(" · ");
  if (!window.confirm(`Download this firmware with Lumi?\n\n${item.title}\n${details}\nSource: ${item.source_name}\n\nConfirm the exact model and region before flashing.`)) return;
  const defaultDir = (typeof state !== "undefined" && state.settings?.default_dir) || "";
  const targetDir = window.prompt("Save firmware to:", defaultDir || "") ?? null;
  if (targetDir === null) return;
  button.disabled = true;
  try {
    const task = await v5Api("POST", "/api/v5/firmware/stage", {
      url: item.url, filename: item.filename || "", target_dir: targetDir,
      provider: item.provider, source_name: item.source_name, source_url: item.source_url,
      brand: item.brand, device: item.device, version: item.version, build: item.build,
      channel: item.channel, sha256: item.sha256,
    });
    await v5Api("POST", `/api/downloads/${encodeURIComponent(task.id)}/confirm`, {
      filename: task.filename, target_dir: targetDir, connections: 0,
    });
    if (typeof refreshFoundation === "function") await refreshFoundation();
    v5Toast("Firmware queued", item.filename || item.title, "success");
    if (typeof switchView === "function") switchView("downloads");
  } catch (error) {
    v5Toast("Firmware not queued", error.message, "error");
  } finally { button.disabled = false; }
}

async function loadPromotion() {
  try {
    const response = await v5Api("GET", "/api/v5/promotions/current");
    const promo = response.promotion;
    if (!promo) return;
    const element = document.getElementById("hunter-promo");
    element.dataset.url = promo.url || "";
    document.getElementById("hunter-promo-title").textContent = promo.title || "TTG update";
    document.getElementById("hunter-promo-copy").textContent = promo.copy || "See what is new";
    const image = document.getElementById("hunter-promo-image");
    if (promo.image_url) { image.src = promo.image_url; image.alt = promo.title || "TTG update"; }
    else image.hidden = true;
    element.hidden = false;
  } catch (_) {}
}

function openPromotion() {
  const url = document.getElementById("hunter-promo")?.dataset.url;
  if (url) window.open(url, "_blank", "noopener");
}

function observeSettings() {
  const target = document.getElementById("view-settings");
  if (!target) return;
  const observer = new MutationObserver(() => injectDesktopSettings());
  observer.observe(target, { childList: true, subtree: true });
  injectDesktopSettings();
}

async function injectDesktopSettings() {
  const nav = document.querySelector("#view-settings .settings-nav");
  const container = nav?.nextElementSibling;
  if (!nav || !container || nav.querySelector('[data-tab="desktop"]')) return;
  const tab = document.createElement("button");
  tab.type = "button"; tab.dataset.action = "settings-tab"; tab.dataset.tab = "desktop"; tab.textContent = "Desktop & updates";
  tab.addEventListener("click", () => { if (typeof switchSettingsTab === "function") switchSettingsTab("desktop"); void loadDesktopSettings(); });
  nav.appendChild(tab);
  const section = document.createElement("section");
  section.className = "settings-section"; section.dataset.settingsSection = "desktop"; section.id = "desktop-settings-v5";
  section.innerHTML = desktopSettingsHtml(null);
  container.appendChild(section);
  section.addEventListener("submit", saveDesktopSettings);
  section.addEventListener("click", event => {
    if (event.target.closest('[data-desktop-action="check-update"]')) void checkForUpdates(true);
    if (event.target.closest('[data-desktop-action="show-widget"]')) window.electronApp?.showWidget?.();
  });
}

function desktopSettingsHtml(value) {
  if (!window.electronApp?.isElectron) return `<section class="settings-card"><div class="settings-card-head"><h3>Desktop controls</h3><p>Available in the installed Lumi desktop application</p></div><div class="settings-card-body"><div class="empty">This browser view cannot position the native corner widget or install desktop updates.</div></div></section>`;
  const settings = value || { corner: "bottom-right", margin: 12, scale: 1, visible: true, displayId: "primary", showUpload: false };
  return `<section class="settings-card"><div class="settings-card-head"><h3>Corner speed widget</h3><p>Quietly monitors internet speed and becomes the download controller when work starts</p></div><div class="settings-card-body"><form id="desktop-settings-form"><div class="desktop-setting-grid"><div><div class="setting-row"><div class="setting-label"><strong>Screen corner</strong><small>The setup popup opens inward from this corner</small></div><select class="select" name="corner"><option value="bottom-right" ${settings.corner === "bottom-right" ? "selected" : ""}>Bottom right</option><option value="bottom-left" ${settings.corner === "bottom-left" ? "selected" : ""}>Bottom left</option><option value="top-right" ${settings.corner === "top-right" ? "selected" : ""}>Top right</option><option value="top-left" ${settings.corner === "top-left" ? "selected" : ""}>Top left</option></select></div><div class="setting-row"><div class="setting-label"><strong>Display</strong><small>Choose the monitor that owns the widget</small></div><select class="select" name="displayId">${(settings.displays || [{ id: "primary", label: "Primary display" }]).map(display => `<option value="${v5Esc(display.id)}" ${String(settings.displayId) === String(display.id) ? "selected" : ""}>${v5Esc(display.label)}</option>`).join("")}</select></div><div class="setting-row"><div class="setting-label"><strong>Edge margin</strong><small>Distance from the screen work area</small></div><input class="input" name="margin" type="number" min="4" max="80" value="${Number(settings.margin || 12)}"></div><div class="setting-row"><div class="setting-label"><strong>Widget scale</strong><small>Preserves the Lumi logo aspect ratio at every size</small></div><select class="select" name="scale"><option value="0.85" ${Number(settings.scale) === .85 ? "selected" : ""}>Small</option><option value="1" ${Number(settings.scale || 1) === 1 ? "selected" : ""}>Normal</option><option value="1.15" ${Number(settings.scale) === 1.15 ? "selected" : ""}>Large</option></select></div><label class="check"><input type="checkbox" name="visible" ${settings.visible !== false ? "checked" : ""}>Show the permanent speed widget</label><label class="check"><input type="checkbox" name="showUpload" ${settings.showUpload ? "checked" : ""}>Show upload speed while idle</label></div><div><div class="desktop-preview"><div class="desktop-widget-dot" data-corner="${v5Esc(settings.corner)}"></div></div><div class="desktop-status">The widget uses the monitor work area and stays below system taskbar flyouts.</div><button class="btn" type="button" data-desktop-action="show-widget">Preview widget</button></div></div><div class="form-actions"><button class="btn primary" type="submit">Save widget settings</button></div></form></div></section><section class="settings-card"><div class="settings-card-head"><h3>Application updates</h3><p>Checks GitHub Releases whenever Lumi opens</p></div><div class="settings-card-body"><div class="update-card"><div><strong id="desktop-update-title">Checking release status…</strong><small id="desktop-update-copy">Verified updates download in the background and ask before installation.</small></div><button class="btn" type="button" data-desktop-action="check-update">Check now</button></div></div></section>`;
}

async function loadDesktopSettings() {
  const section = document.getElementById("desktop-settings-v5");
  if (!section || !window.electronApp?.getDesktopSettings) return;
  try {
    v5State.desktop = await window.electronApp.getDesktopSettings();
    section.innerHTML = desktopSettingsHtml(v5State.desktop);
    await checkForUpdates(false);
  } catch (error) { v5Toast("Desktop settings unavailable", error.message, "error"); }
}

async function saveDesktopSettings(event) {
  if (event.target.id !== "desktop-settings-form") return;
  event.preventDefault();
  const form = event.target;
  const value = {
    corner: form.elements.corner.value, displayId: form.elements.displayId.value,
    margin: Number(form.elements.margin.value || 12), scale: Number(form.elements.scale.value || 1),
    visible: form.elements.visible.checked, showUpload: form.elements.showUpload.checked,
  };
  try {
    v5State.desktop = await window.electronApp.saveDesktopSettings(value);
    v5Toast("Widget settings saved", "The corner monitor moved without opening the full manager.", "success");
    document.getElementById("desktop-settings-v5").innerHTML = desktopSettingsHtml(v5State.desktop);
  } catch (error) { v5Toast("Widget settings not saved", error.message, "error"); }
}

async function checkForUpdates(manual) {
  if (!window.electronApp?.checkForUpdates) return;
  try {
    const result = await window.electronApp.checkForUpdates(Boolean(manual));
    const title = document.getElementById("desktop-update-title");
    const copy = document.getElementById("desktop-update-copy");
    if (!title || !copy) return;
    title.textContent = result.available ? `Lumi ${result.version} is available` : `Lumi ${result.currentVersion || ""} is up to date`;
    copy.textContent = result.message || (result.available ? "The release can be downloaded and installed securely." : "No newer GitHub release was found.");
  } catch (error) { if (manual) v5Toast("Update check failed", error.message, "error"); }
}

function v5Toast(title, message, type = "info") {
  if (typeof toast === "function") return toast(title, message, type);
  window.alert(`${title}\n${message}`);
}

function v5Esc(value) {
  return String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function v5FmtBytes(value) {
  const size = Number(value || 0);
  if (size >= 1073741824) return `${(size / 1073741824).toFixed(2)} GB`;
  if (size >= 1048576) return `${(size / 1048576).toFixed(1)} MB`;
  if (size >= 1024) return `${(size / 1024).toFixed(0)} KB`;
  return size ? `${size} B` : "—";
}
