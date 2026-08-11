"use strict";

/* Small approved-UI data bridge. No transfer behavior is reimplemented here.
   The storage card consumes Lumi's authenticated maintenance endpoint and the
   live overview state already maintained by app.js. */
(() => {
  const STORAGE_KEY = "Lumi.sidebar.storage.path";
  let storageRows = [];
  let bestSpeed = 0;

  window.addEventListener("DOMContentLoaded", () => {
    lockApprovedShell();
    const observer = new MutationObserver(lockApprovedShell);
    observer.observe(document.body, { childList: true, subtree: true });

    const select = document.getElementById("lumi-storage-drive");
    select?.addEventListener("change", () => {
      localStorage.setItem(STORAGE_KEY, select.value);
      void refreshStorage(select.value);
    });

    setTimeout(() => void refreshStorage(), 1200);
    setInterval(updateBestSpeed, 1200);
    setInterval(() => void refreshStorage(currentPath()), 30000);
  }, { once: true });

  function lockApprovedShell() {
    const title = document.querySelector(".ttg-titlebar-brand");
    if (title && title.dataset.lumiLocked !== "true") {
      title.innerHTML = "<strong>THETECHGUY TOOL</strong>";
      title.dataset.lumiLocked = "true";
    }

    const gear = document.getElementById("ttg-gear-menu");
    if (gear) {
      const extension = gear.querySelector('[data-main-shell-action="extension"] span:last-child');
      const update = gear.querySelector('[data-shell-action="update"] span:last-child');
      const help = gear.querySelector('[data-main-shell-action="help"] span:last-child');
      if (extension) extension.textContent = "Browser extension";
      if (update) update.textContent = "Check for updates";
      if (help) help.textContent = "Help / Report a bug";

      const head = gear.querySelector(".ttg-shell-menu-head");
      if (head && !gear.querySelector(".lumi-appearance-control")) {
        gear.insertAdjacentHTML("beforeend", `
          <hr class="ttg-theme-divider">
          <div class="ttg-theme-control lumi-appearance-control" role="group" aria-label="Appearance">
            <span>Appearance</span>
            <div class="ttg-theme-segment ttg-theme-segment-two">
              <button type="button" data-lumi-theme="dark" aria-pressed="false">Dark</button>
              <button type="button" data-lumi-theme="glass" aria-pressed="false">Clear Glass</button>
            </div>
          </div>`);
        window.LumiTheme?.apply?.(window.LumiTheme.get());
      }
    }

    const quick = document.querySelector("#view-overview .lumi-quick-grid");
    const clear = quick?.querySelector('[data-action="clear-done"]');
    if (clear) {
      clear.classList.remove("danger");
      clear.removeAttribute("data-action");
      clear.dataset.mainView = "categories";
      clear.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></svg><span>Categories</span>`;
    }
  }

  function currentPath() {
    const selected = document.getElementById("lumi-storage-drive")?.value;
    if (selected) return selected;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    try { return String(state?.settings?.default_dir || ""); }
    catch (_) { return ""; }
  }

  async function refreshStorage(path = "") {
    if (typeof api !== "function") return;
    try {
      let requested = path || currentPath();
      if (!requested) {
        try { requested = String(state?.settings?.default_dir || ""); } catch (_) {}
      }
      const route = requested
        ? `/api/v4/maintenance/storage?path=${encodeURIComponent(requested)}`
        : "/api/v4/maintenance/storage";
      const result = await api("GET", route);
      storageRows = Array.isArray(result?.directories) ? result.directories : [];
      if (result?.selected?.path) {
        const index = storageRows.findIndex(row => row.path === result.selected.path);
        if (index >= 0) storageRows[index] = result.selected;
        else storageRows.unshift(result.selected);
      }
      renderStorage(requested);
    } catch (_) {
      /* Startup can race authentication. The scheduled retry will populate it. */
    }
  }

  function renderStorage(requested) {
    const select = document.getElementById("lumi-storage-drive");
    if (!select || !storageRows.length) return;

    const preferred = storageRows.find(row => row.path === requested)
      || storageRows.find(row => sameVolume(row.path, requested))
      || storageRows[0];

    select.innerHTML = storageRows.map(row =>
      `<option value="${escapeAttribute(row.path)}">${escapeHtml(volumeLabel(row.path))}</option>`
    ).join("");
    select.value = preferred.path;
    localStorage.setItem(STORAGE_KEY, preferred.path);

    const total = Number(preferred.total_bytes || 0);
    const free = Number(preferred.free_bytes || 0);
    const usedPct = total > 0 ? Math.max(0, Math.min(100, Math.round((total - free) * 100 / total))) : 0;

    setText("lumi-storage-free", formatBytes(free));
    setText("lumi-storage-total", total ? `of ${formatBytes(total)}` : "Storage unavailable");
    setText("lumi-storage-percent", `${usedPct}%`);
    document.getElementById("lumi-storage-ring")?.style.setProperty("--lumi-storage-used", `${usedPct}%`);
  }

  function updateBestSpeed() {
    try {
      const current = Number(state?.overview?.total_speed_bytes_per_sec || 0);
      if (Number.isFinite(current)) bestSpeed = Math.max(bestSpeed, current);
    } catch (_) {}
    setText("lumi-storage-best-speed", rate(bestSpeed));
  }

  function rate(value) {
    try { if (typeof fmtRate === "function") return fmtRate(value); } catch (_) {}
    const n = Number(value || 0);
    if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB/s`;
    if (n >= 1024) return `${(n / 1024).toFixed(1)} KB/s`;
    return `${Math.round(n)} B/s`;
  }

  function formatBytes(value) {
    try { if (typeof fmtBytes === "function") return fmtBytes(value); } catch (_) {}
    const n = Number(value || 0);
    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
    if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
    return `${Math.round(n / 1024)} KB`;
  }

  function sameVolume(left, right) {
    if (!left || !right) return false;
    return volumeLabel(left).toLowerCase() === volumeLabel(right).toLowerCase();
  }

  function volumeLabel(path) {
    const value = String(path || "");
    const windows = value.match(/^([A-Za-z]):[\\/]/);
    if (windows) return `Drive ${windows[1].toUpperCase()}:`;
    if (value === "/") return "/";
    return value.length > 18 ? `${value.slice(0, 15)}…` : value || "Storage";
  }

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
  }

  const escapeAttribute = escapeHtml;
})();
