/* Owner-reported extension corrections: truthful speed, normalized status and
 * one in-flight handoff. This remains a thin extension; Lumi is the manager.
 */
"use strict";

let _lumiPopupSending = false;
let _lastManual = { url: "", at: 0 };

function _displayStatus(value) {
  const status = String(value || "queued").toLowerCase();
  if (["resolving", "verifying", "post_processing"].includes(status)) return "downloading";
  return status;
}

function _formatRate(value) {
  const bps = Number(value || 0);
  if (bps >= 1048576) return `${(bps / 1048576).toFixed(2)} MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
  return `${Math.round(bps)} B/s`;
}

function _formatCapacity(result) {
  if (!result || result.state === "not_tested") return "Capacity not tested";
  if (result.state !== "complete" || !(Number(result.download_bps) > 0)) return "Capacity test failed";
  return `Capacity ${(Number(result.download_bps) * 8 / 1_000_000).toFixed(1)} Mbps`;
}

loadList = async function loadListCorrected() {
  if (_listLoading) return;
  _listLoading = true;
  try {
    const [dlResponse, capacityResponse] = await Promise.all([
      _fetch(`${_server}/api/downloads?limit=20`),
      _fetch(`${_server}/api/v6/speedtest/status`).catch(() => null),
    ]);
    if (!dlResponse.ok) throw new Error(`Lumi returned ${dlResponse.status}`);
    const dlData = await dlResponse.json();
    const capacity = capacityResponse?.ok ? await capacityResponse.json() : { state: "not_tested" };
    const jobs = Array.isArray(dlData.downloads) ? dlData.downloads : [];
    const activeJobs = jobs.filter(job => ["running", "downloading", "resolving", "verifying", "post_processing"].includes(String(job.status || "").toLowerCase()));
    const liveBps = activeJobs.reduce((sum, job) => sum + Number(job.speed_bytes_per_sec || 0), 0);

    const live = document.getElementById("speed-label");
    const inet = document.getElementById("inet-label");
    const dot = document.getElementById("speed-dot");
    const sub = document.getElementById("speed-sub");
    if (live) live.textContent = `Live ${_formatRate(liveBps)}`;
    if (inet) inet.textContent = _formatCapacity(capacity);
    if (dot) dot.className = `speed-dot${activeJobs.length ? " active" : ""}`;
    if (sub) sub.textContent = activeJobs.length ? `${activeJobs.length} downloading` : "No active downloads";

    const list = document.getElementById("dl-list");
    if (!list) return;
    if (!jobs.length) {
      list.innerHTML = '<div class="empty-msg">No Lumi downloads yet.</div>';
      return;
    }
    list.innerHTML = jobs.slice(0, 12).map(job => {
      const status = _displayStatus(job.status);
      const pct = Math.min(100, Number(job.progress_percent || 0)).toFixed(0);
      const name = job.filename || job.id || "Download";
      const label = status === "completed" ? "✓" : status === "downloading" ? `${pct}%` : status;
      return `<div class="dl-item"><span class="dl-dot ${status}"></span><span class="dl-name" title="${esc(name)}">${esc(name)}</span><span class="dl-pct">${esc(label)}</span></div>`;
    }).join("");
  } catch (error) {
    const list = document.getElementById("dl-list");
    if (list) list.innerHTML = '<div class="empty-msg">Open Lumi to connect this extension.</div>';
    const badge = document.getElementById("connection-badge");
    if (badge) {
      badge.textContent = "Lumi offline";
      badge.className = "connection-badge warn";
    }
  } finally {
    _listLoading = false;
  }
};

sendDownload = async function sendDownloadCorrected() {
  const input = document.getElementById("url-input");
  const button = document.getElementById("go-btn");
  const url = String(input?.value || "").trim();
  if (!url || _lumiPopupSending) return;
  if (_lastManual.url === url && Date.now() - _lastManual.at < 10000) {
    setMsg("This link is already being handed to Lumi.");
    return;
  }
  _lumiPopupSending = true;
  _lastManual = { url, at: Date.now() };
  if (button) button.disabled = true;
  let type = _selectedType;
  if (type === "auto") {
    if (url.startsWith("magnet:") || /\.torrent(?:\?|$)/i.test(url)) type = "torrent";
    else if (/\.(?:m3u8|mpd)(?:\?|$)/i.test(url)) type = "video";
    else type = "auto";
  }
  setMsg("Sending to Lumi…");
  try {
    const response = await new Promise(resolve => {
      chrome.runtime.sendMessage({ type: "DOWNLOAD", url, dlType: type }, result => {
        resolve(result || { ok: false, result: { error: chrome.runtime.lastError?.message || "No response" } });
      });
    });
    if (!response.ok) throw new Error(response.result?.error || "Lumi is unavailable");
    if (input) input.value = "";
    setMsg("Lumi is opening the download panel.");
    setTimeout(() => window.close(), 250);
  } catch (error) {
    setMsg(`Could not hand off: ${error.message}`);
    _lastManual = { url: "", at: 0 };
  } finally {
    _lumiPopupSending = false;
    if (button) button.disabled = false;
  }
};
