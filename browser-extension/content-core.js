"use strict";

const LUMI_DOWNLOADABLE_EXTENSIONS = new Set([
  "zip", "rar", "7z", "gz", "tar", "bz2", "xz", "zst",
  "exe", "msi", "dmg", "pkg", "deb", "rpm", "apk", "ipa", "appx",
  "mp4", "mkv", "avi", "mov", "wmv", "flv", "webm", "ts", "m2ts",
  "mp3", "flac", "wav", "aac", "ogg", "opus", "m4a",
  "pdf", "epub", "mobi", "azw3", "torrent", "iso", "img", "ipsw",
]);

function extensionOf(value) {
  try {
    const parsed = new URL(value, location.href);
    const name = parsed.pathname.split("/").pop() || "";
    const index = name.lastIndexOf(".");
    return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
  } catch {
    return "";
  }
}

document.addEventListener("click", event => {
  const link = event.target.closest("a[href]");
  if (!link) return;
  const href = String(link.href || "");
  if (!href.startsWith("magnet:") && extensionOf(href) !== "torrent") return;
  event.preventDefault();
  event.stopImmediatePropagation();
  chrome.runtime.sendMessage({ type: "DOWNLOAD", url: href, dlType: "torrent" });
}, true);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "SCAN_LINKS") return false;
  const links = [];
  const seen = new Set();
  for (const anchor of document.querySelectorAll("a[href]")) {
    const url = String(anchor.href || "");
    if (!/^https?:/i.test(url)) continue;
    const ext = extensionOf(url);
    if (!LUMI_DOWNLOADABLE_EXTENSIONS.has(ext) || seen.has(url)) continue;
    seen.add(url);
    links.push({
      url,
      filename: String(anchor.textContent || "").trim() || decodeURIComponent(url.split("/").pop() || "download"),
      ext,
    });
  }
  sendResponse({ links });
  return false;
});
