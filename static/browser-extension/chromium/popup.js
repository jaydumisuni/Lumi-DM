"use strict";

const API_BASE = "http://127.0.0.1:7000";
const statusBox = document.getElementById("status");
const pairForm = document.getElementById("pair-form");
const forgetButton = document.getElementById("forget");
const enabled = document.getElementById("enabled");

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
async function request(path, options = {}, token = "") {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Lumi-Client": "browser-extension-chromium",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!response.ok) throw new Error(data.error || `Lumi returned ${response.status}`);
  return data;
}
async function refresh() {
  const value = await getStorage(["lumiToken", "lumiEnabled"]);
  enabled.checked = value.lumiEnabled !== false;
  if (!value.lumiToken) {
    status("Not paired with Lumi", "bad");
    pairForm.hidden = false;
    forgetButton.hidden = true;
    return;
  }
  try {
    const me = await request("/api/v4/security/me", {}, value.lumiToken);
    status(`Connected · ${me.client_name || "Lumi owner"}`, "ok");
    pairForm.hidden = true;
    forgetButton.hidden = false;
  } catch (error) {
    status(`Lumi unavailable: ${error.message}`, "bad");
    pairForm.hidden = false;
    forgetButton.hidden = false;
  }
}
pairForm.addEventListener("submit", async event => {
  event.preventDefault();
  const code = String(document.getElementById("code").value || "").trim().toUpperCase();
  if (!code) return;
  status("Pairing with Lumi…");
  try {
    const result = await request("/api/security/pair", {
      method: "POST",
      body: JSON.stringify({ code, client_name: "Lumi Chrome / Edge Extension" }),
    });
    await setStorage({ lumiToken: result.token, lumiEnabled: true });
    document.getElementById("code").value = "";
    await refresh();
  } catch (error) {
    status(`Pairing failed: ${error.message}`, "bad");
  }
});
enabled.addEventListener("change", () => setStorage({ lumiEnabled: enabled.checked }));
forgetButton.addEventListener("click", async () => {
  await removeStorage(["lumiToken"]);
  await refresh();
});
void refresh();
