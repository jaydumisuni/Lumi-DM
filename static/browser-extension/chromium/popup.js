"use strict";

const API_BASE = "http://127.0.0.1:7000";
const connectionCard = document.getElementById("connection-card");
const connectionTitle = document.getElementById("connection-title");
const connectionMessage = document.getElementById("connection-message");
const pairForm = document.getElementById("pair-form");
const pairedPanel = document.getElementById("paired-panel");
const forgetButton = document.getElementById("forget");
const enabled = document.getElementById("enabled");
const refreshButton = document.getElementById("refresh");
const openLumiButton = document.getElementById("open-lumi");
const pageCard = document.getElementById("page-card");
const pageTitle = document.getElementById("page-title");
const pageMessage = document.getElementById("page-message");
const openMediaButton = document.getElementById("open-media");

function getStorage(keys) { return new Promise(resolve => chrome.storage.local.get(keys, resolve)); }
function setStorage(value) { return new Promise(resolve => chrome.storage.local.set(value, resolve)); }
function removeStorage(keys) { return new Promise(resolve => chrome.storage.local.remove(keys, resolve)); }
function activeTabs() { return new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve)); }

function request(path, options = {}, token = "") {
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Lumi-Client": "browser-extension-chromium",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  }).then(async response => {
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
    if (!response.ok) throw new Error(data.error || `Lumi returned ${response.status}`);
    return data;
  });
}

function sendRuntime(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, response => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else if (!response?.ok) reject(new Error(response?.error || "Lumi extension request failed"));
      else resolve(response);
    });
  });
}

function setConnection(title, message, type = "") {
  connectionCard.className = `connection-card ${type}`.trim();
  connectionTitle.textContent = title;
  connectionMessage.textContent = message;
}

async function pageState() {
  pageCard.hidden = true;
  try {
    const [tab] = await activeTabs();
    if (!tab?.id || !/^https?:/i.test(tab.url || "")) return;
    const result = await chrome.tabs.sendMessage(tab.id, { type: "lumi-page-state" });
    if (!result?.ok || !result.hasMedia) return;
    pageTitle.textContent = result.title || "Video detected";
    pageMessage.textContent = result.directCount ? `${result.directCount} direct source${result.directCount === 1 ? "" : "s"} detected` : "Lumi can inspect available qualities";
    pageCard.hidden = false;
  } catch (_) {}
}

async function refresh() {
  refreshButton.disabled = true;
  setConnection("Checking Lumi…", "Looking for the Lumi desktop app.");
  const value = await getStorage(["lumiToken", "lumiEnabled"]);
  enabled.checked = value.lumiEnabled !== false;
  if (!value.lumiToken) {
    setConnection("Not paired", "Generate a secure code inside Lumi to connect this browser.", "bad");
    pairForm.hidden = false;
    pairedPanel.hidden = true;
    pageCard.hidden = true;
    refreshButton.disabled = false;
    return;
  }
  try {
    const me = await request("/api/v4/security/me", {}, value.lumiToken);
    setConnection("Lumi is ready", `Connected as ${me.client_name || "Lumi owner"}.`, "ok");
    pairForm.hidden = true;
    pairedPanel.hidden = false;
    await pageState();
  } catch (error) {
    setConnection("Lumi is unavailable", error.message, "bad");
    pairForm.hidden = false;
    pairedPanel.hidden = false;
    pageCard.hidden = true;
  } finally {
    refreshButton.disabled = false;
  }
}

pairForm.addEventListener("submit", async event => {
  event.preventDefault();
  const codeInput = document.getElementById("code");
  const code = String(codeInput.value || "").trim().toUpperCase();
  if (!code) return;
  const submit = pairForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  setConnection("Pairing…", "Confirming the one-time Lumi code.");
  try {
    const result = await request("/api/security/pair", {
      method: "POST",
      body: JSON.stringify({ code, client_name: "Lumi Chrome / Edge Extension" }),
    });
    await setStorage({ lumiToken: result.token, lumiEnabled: true });
    codeInput.value = "";
    await refresh();
  } catch (error) {
    setConnection("Pairing failed", error.message, "bad");
  } finally {
    submit.disabled = false;
  }
});

enabled.addEventListener("change", async () => {
  await sendRuntime({ type: "lumi-set-enabled", enabled: enabled.checked }).catch(() => setStorage({ lumiEnabled: enabled.checked }));
});

forgetButton.addEventListener("click", async () => {
  await removeStorage(["lumiToken"]);
  await refresh();
});

refreshButton.addEventListener("click", () => void refresh());
openLumiButton.addEventListener("click", async () => {
  openLumiButton.disabled = true;
  try {
    await sendRuntime({ type: "lumi-open-main" });
    window.close();
  } catch (error) {
    setConnection("Could not open Lumi", error.message, "bad");
    openLumiButton.disabled = false;
  }
});

openMediaButton.addEventListener("click", async () => {
  try {
    const [tab] = await activeTabs();
    if (!tab?.id) throw new Error("Current browser tab is unavailable");
    const result = await chrome.tabs.sendMessage(tab.id, { type: "lumi-open-panel" });
    if (!result?.ok) throw new Error(result?.error || "Media panel could not open");
    window.close();
  } catch (error) {
    setConnection("Media panel unavailable", error.message, "bad");
  }
});

void refresh();
