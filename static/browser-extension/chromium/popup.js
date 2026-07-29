"use strict";

const API_BASE = "http://127.0.0.1:7000";
const statusBox = document.getElementById("status");
const pairForm = document.getElementById("pair-form");
const forgetButton = document.getElementById("forget");
const enabled = document.getElementById("enabled");
const pageCard = document.getElementById("page-card");
const pageTitle = document.getElementById("page-title");
const pageDetail = document.getElementById("page-detail");
const openMediaPanel = document.getElementById("open-media-panel");
const note = document.getElementById("note");
let currentTab = null;

function getStorage(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve));
}
function setStorage(value) {
  return new Promise(resolve => chrome.storage.local.set(value, resolve));
}
function removeStorage(keys) {
  return new Promise(resolve => chrome.storage.local.remove(keys, resolve));
}
function status(text, type = "") {
  statusBox.className = `status ${type}`.trim();
  statusBox.querySelector("span").textContent = text;
}
function runtimeMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else if (!response?.ok) reject(new Error(response?.error || "Lumi extension request failed"));
      else resolve(response);
    });
  });
}
function tabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, response => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else if (!response?.ok) reject(new Error(response?.error || "This page is not ready for Lumi"));
      else resolve(response);
    });
  });
}
function activeTab() {
  return new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, tabs => resolve(tabs[0] || null)));
}
async function requestPair(code) {
  const response = await fetch(`${API_BASE}/api/security/pair`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Lumi-Client": "browser-extension-chromium" },
    body: JSON.stringify({ code, client_name: "Lumi Chrome / Edge Extension" }),
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!response.ok) throw new Error(data.error || `Lumi returned ${response.status}`);
  return data;
}
async function refreshPageCard(paired) {
  pageCard.hidden = true;
  currentTab = await activeTab();
  if (!paired || !currentTab?.id || !/^https?:/i.test(currentTab.url || "")) return;
  try {
    const state = await tabMessage(currentTab.id, { type: "lumi-page-state" });
    if (!state.hasMedia) return;
    pageTitle.textContent = state.title || currentTab.title || "Current video";
    pageDetail.textContent = state.directCount
      ? `${state.directCount} direct source${state.directCount === 1 ? "" : "s"} detected. Lumi can also inspect the page for real qualities.`
      : "Lumi can inspect this page and list its available video and audio qualities.";
    pageCard.hidden = false;
  } catch (_) {
    pageCard.hidden = true;
  }
}
async function refresh() {
  const value = await getStorage(["lumiEnabled"]);
  enabled.checked = value.lumiEnabled !== false;
  let paired = false;
  try {
    const result = await runtimeMessage({ type: "lumi-extension-status" });
    paired = Boolean(result.paired && result.available);
    if (paired) {
      status(`Connected · ${result.clientName || "Lumi owner"}`, "ok");
      pairForm.hidden = true;
      forgetButton.hidden = false;
      note.textContent = "Open a video page and use the Lumi quality button on the player.";
    } else {
      status(result.message || "Not paired with Lumi", "bad");
      pairForm.hidden = false;
      forgetButton.hidden = true;
      note.textContent = "Generate a code in Lumi → Settings → Security → Pair another device.";
    }
  } catch (error) {
    status(`Lumi unavailable · ${error.message}`, "bad");
    pairForm.hidden = false;
    forgetButton.hidden = false;
  }
  await refreshPageCard(paired);
}

pairForm.addEventListener("submit", async event => {
  event.preventDefault();
  const code = String(document.getElementById("code").value || "").trim().toUpperCase();
  if (!code) return;
  status("Pairing with Lumi…");
  try {
    const result = await requestPair(code);
    if (!result.token) throw new Error("Lumi returned no pairing token");
    await setStorage({ lumiToken: result.token, lumiEnabled: true });
    document.getElementById("code").value = "";
    await refresh();
  } catch (error) {
    status(`Pairing failed · ${error.message}`, "bad");
  }
});

enabled.addEventListener("change", async () => {
  await setStorage({ lumiEnabled: enabled.checked });
  try { await runtimeMessage({ type: "lumi-set-enabled", enabled: enabled.checked }); } catch (_) {}
  if (currentTab?.id) {
    try { await chrome.tabs.reload(currentTab.id); } catch (_) {}
  }
});

forgetButton.addEventListener("click", async () => {
  await removeStorage(["lumiToken"]);
  await refresh();
});

openMediaPanel.addEventListener("click", async () => {
  if (!currentTab?.id) return;
  openMediaPanel.disabled = true;
  openMediaPanel.textContent = "Opening Lumi panel…";
  try {
    await tabMessage(currentTab.id, { type: "lumi-open-panel" });
    window.close();
  } catch (error) {
    status(error.message, "bad");
    openMediaPanel.disabled = false;
    openMediaPanel.textContent = "Open quality list";
  }
});

void refresh();
