"use strict";

const connectionCard = document.getElementById("connection-card");
const connectionTitle = document.getElementById("connection-title");
const connectionMessage = document.getElementById("connection-message");
const enabled = document.getElementById("enabled");
const refreshButton = document.getElementById("refresh");
const openLumiButton = document.getElementById("open-lumi");
const pageCard = document.getElementById("page-card");
const pageTitle = document.getElementById("page-title");
const pageMessage = document.getElementById("page-message");
const openMediaButton = document.getElementById("open-media");
const linksCard = document.getElementById("links-card");
const linksTitle = document.getElementById("links-title");
const linksMessage = document.getElementById("links-message");
const grabLinksButton = document.getElementById("grab-links");

function getStorage(keys) { return new Promise(resolve => chrome.storage.local.get(keys, resolve)); }
function activeTabs() { return new Promise(resolve => chrome.tabs.query({ active: true, currentWindow: true }, resolve)); }
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
  linksCard.hidden = true;
  try {
    const [tab] = await activeTabs();
    if (!tab?.id || !/^https?:/i.test(tab.url || "")) return;
    const result = await chrome.tabs.sendMessage(tab.id, { type: "lumi-page-state" });
    if (!result?.ok) return;
    if (result.hasMedia) {
      pageTitle.textContent = result.title || "Media detected";
      pageMessage.textContent = result.directCount
        ? `${result.directCount} browser-observed source${result.directCount === 1 ? "" : "s"}`
        : "Lumi can inspect the active browser session";
      pageCard.hidden = false;
    }
    if (Number(result.linkCount || 0) > 0) {
      linksTitle.textContent = `${result.linkCount} link${result.linkCount === 1 ? "" : "s"} detected`;
      linksMessage.textContent = "Send browser-visible links to Lumi LinkGrabber.";
      linksCard.hidden = false;
    }
  } catch (_) {}
}

async function refresh() {
  refreshButton.disabled = true;
  setConnection("Checking Lumi…", "Connecting automatically to the local Lumi Runtime.");
  const stored = await getStorage(["lumiEnabled"]);
  enabled.checked = stored.lumiEnabled !== false;
  try {
    const response = await sendRuntime({ type: "lumi-extension-status" });
    const status = response.status || {};
    if (!status.available) throw new Error(status.message || "Lumi DM is not running.");
    const detail = status.bridge === "connected"
      ? "Persistent browser bridge connected."
      : "Runtime connected; persistent bridge is reconnecting.";
    setConnection("Lumi is ready", detail, "ok");
    await pageState();
  } catch (error) {
    setConnection("Lumi is not running", error.message || String(error), "bad");
    pageCard.hidden = true;
    linksCard.hidden = true;
  } finally {
    refreshButton.disabled = false;
  }
}

enabled.addEventListener("change", async () => {
  try { await sendRuntime({ type: "lumi-set-enabled", enabled: enabled.checked }); }
  catch (_) {}
});
refreshButton.addEventListener("click", () => void refresh());
openLumiButton.addEventListener("click", async () => {
  openLumiButton.disabled = true;
  try {
    await sendRuntime({ type: "lumi-open-main" });
    window.close();
  } catch (error) {
    setConnection("Could not open Lumi", error.message || String(error), "bad");
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
    setConnection("Media panel unavailable", error.message || String(error), "bad");
  }
});

void refresh();

grabLinksButton.addEventListener("click", async () => {
  grabLinksButton.disabled = true;
  try {
    const [tab] = await activeTabs();
    if (!tab?.id) throw new Error("Current browser tab is unavailable");
    const page = await chrome.tabs.sendMessage(tab.id, { type: "lumi-page-links" });
    if (!page?.ok || !Array.isArray(page.links) || !page.links.length) throw new Error("No browser-visible links were found on this page");
    const response = await sendRuntime({ type: "lumi-linkgrabber-import", pageUrl: page.url || tab.url || "", title: page.title || tab.title || "Browser page", links: page.links });
    const count = Number(response.imported?.count || page.links.length);
    linksTitle.textContent = `${count} link${count === 1 ? "" : "s"} sent`;
    linksMessage.textContent = "Lumi LinkGrabber is ready with the imported page links.";
    grabLinksButton.textContent = "Sent";
    setTimeout(() => window.close(), 350);
  } catch (error) {
    setConnection("LinkGrabber import failed", error.message || String(error), "bad");
    grabLinksButton.disabled = false;
  }
});
