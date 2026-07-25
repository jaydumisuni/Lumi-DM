const { contextBridge, ipcRenderer } = require('electron');

const DOWNLOAD_ICONS = Object.freeze({
  windows: `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="w" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#31b9ff"/><stop offset="1" stop-color="#0878d7"/></linearGradient></defs><rect x="5" y="7" width="24" height="23" rx="1.5" fill="url(#w)"/><rect x="34" y="4" width="25" height="26" rx="1.5" fill="url(#w)"/><rect x="5" y="35" width="24" height="22" rx="1.5" fill="url(#w)"/><rect x="34" y="35" width="25" height="25" rx="1.5" fill="url(#w)"/></svg>`,
  ubuntu: `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="#E95420"/><g fill="#fff"><circle cx="32" cy="13" r="5"/><circle cx="15.6" cy="41.5" r="5"/><circle cx="48.4" cy="41.5" r="5"/></g><g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"><path d="M24.5 18.2A17 17 0 0 0 17 31"/><path d="M19.2 47A17 17 0 0 0 35 49"/><path d="M46.8 34A17 17 0 0 0 39.5 18.2"/></g><circle cx="32" cy="32" r="7.8" fill="#E95420" stroke="#fff" stroke-width="4"/></svg>`,
  linux: `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="38" rx="19" ry="22" fill="#111827"/><ellipse cx="32" cy="41" rx="12" ry="16" fill="#f4f6fb"/><circle cx="25" cy="23" r="6" fill="#f4f6fb"/><circle cx="39" cy="23" r="6" fill="#f4f6fb"/><circle cx="26" cy="23" r="2.2" fill="#111827"/><circle cx="38" cy="23" r="2.2" fill="#111827"/><path d="M27 29l5-4 5 4-5 5z" fill="#f5b51b"/><path d="M17 53c4-2 8-1 11 2-5 4-10 4-15 1zM47 53c-4-2-8-1-11 2 5 4 10 4 15 1z" fill="#f5b51b"/></svg>`,
  ventoy: `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="v" cx="35%" cy="22%" r="78%"><stop stop-color="#74d7ff"/><stop offset=".48" stop-color="#147ed1"/><stop offset="1" stop-color="#083b82"/></radialGradient></defs><circle cx="32" cy="32" r="29" fill="url(#v)"/><path d="M20 42l18-24 9 7-18 24z" fill="#fff"/><path d="M37 18l6-3 7 6-3 6z" fill="#fff"/><path d="M27 37l9-12m-5 7l7 5m-4-9l4-3" fill="none" stroke="#147ed1" stroke-width="2.7" stroke-linecap="round"/></svg>`,
  rufus: `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="r" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f7f7f8"/><stop offset=".55" stop-color="#aeb5be"/><stop offset="1" stop-color="#6f7782"/></linearGradient></defs><rect x="7" y="7" width="50" height="50" rx="12" fill="#333b46"/><g transform="rotate(-39 32 31)"><rect x="25" y="13" width="17" height="33" rx="5" fill="url(#r)"/><rect x="28.5" y="8" width="10" height="9" rx="1.5" fill="#d9dde2"/><rect x="30" y="9.5" width="2.4" height="4" fill="#707782"/><rect x="35" y="9.5" width="2.4" height="4" fill="#707782"/><rect x="28" y="23" width="11" height="8" rx="2" fill="#cfd4da" stroke="#8a929c" stroke-width="1"/></g><text x="44" y="55" text-anchor="middle" font-family="Segoe UI,Arial" font-size="15" font-weight="800" fill="#fff">R</text></svg>`,
  office: `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="o" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ff6a24"/><stop offset="1" stop-color="#c83216"/></linearGradient></defs><path d="M12 13l25-8 17 9v36l-17 9-25-8z" fill="url(#o)"/><path d="M24 20l15-4 7 4v24l-7 4-15-4z" fill="#fff" opacity=".92"/><path d="M28 24l8-2 4 2v16l-4 2-8-2z" fill="#e44722"/></svg>`,
  apple: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M40 12c3-4 3-8 3-10-4 0-8 3-10 6-2 2-4 6-3 9 4 0 8-2 10-5zM49 35c0-9 8-13 8-13-4-6-11-7-14-7-6-1-12 4-15 4-4 0-9-4-14-4-7 0-13 4-16 10-7 12-2 30 5 40 3 5 7 10 12 10 5 0 7-3 13-3s8 3 13 3c5 0 9-5 12-10 4-6 6-12 6-13-1 0-10-4-10-17z" fill="#f4f7ff" transform="translate(3 -8) scale(.92)"/></svg>`,
  portableapps: `<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="28" fill="#1f2937"/><path d="M19 35a14 14 0 1 1 7 9" fill="none" stroke="#70d34b" stroke-width="7" stroke-linecap="round"/><path d="M17 47l2-14 12 8z" fill="#70d34b"/><path d="M31 20h9a5 5 0 0 1 5 5v13a5 5 0 0 1-5 5h-9z" fill="#fff" opacity=".95"/><circle cx="37" cy="38" r="2" fill="#1f2937"/></svg>`,
  archive: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M11 9h42v46H11z" rx="7" fill="#7f36ee"/><path d="M27 9h10v9H27zm0 12h10v9H27zm0 12h10v9H27zm0 12h10v10H27z" fill="#f3e8ff"/><path d="M24 28h16v19H24z" fill="none" stroke="#f3e8ff" stroke-width="3"/></svg>`,
  disc: `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="d"><stop stop-color="#fff"/><stop offset=".25" stop-color="#b9ddff"/><stop offset=".58" stop-color="#668cff"/><stop offset="1" stop-color="#6d2be9"/></radialGradient></defs><circle cx="32" cy="32" r="27" fill="url(#d)"/><circle cx="32" cy="32" r="8" fill="#0b1020"/><circle cx="32" cy="32" r="3" fill="#dbeafe"/></svg>`,
  file: `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M14 6h25l12 12v40H14z" fill="#2d8cff"/><path d="M39 6v14h14" fill="#75c6ff"/><path d="M21 31h23M21 40h23M21 49h16" stroke="#fff" stroke-width="4" stroke-linecap="round"/></svg>`,
});

function downloadIconKey(fileName) {
  const name = String(fileName || '').toLowerCase();
  if (name.includes('ventoy')) return 'ventoy';
  if (name.includes('rufus')) return 'rufus';
  if (name.includes('office') || name.includes('microsoft 365') || name.includes('m365')) return 'office';
  if (name.includes('portableapps')) return 'portableapps';
  if (name.includes('ubuntu')) return 'ubuntu';
  if (/\bwindows\b|\bwin(?:dows)?(?:10|11)\b|\bwin(?:10|11)_/.test(name)) return 'windows';
  if (name.includes('macos') || name.includes('os x') || name.includes('apple')) return 'apple';
  if (name.includes('linux') || name.includes('debian') || name.includes('fedora') || name.includes('mint') || name.includes('archlinux')) return 'linux';
  if (/\.(zip|rar|7z|tar|gz|bz2|xz)$/.test(name)) return 'archive';
  if (/\.(iso|img|dmg)$/.test(name)) return 'disc';
  return 'file';
}

function refreshDownloadIcons(root = document) {
  for (const row of root.querySelectorAll('.task-row')) {
    const name = row.querySelector('.task-name')?.textContent || '';
    const icon = row.querySelector('.file-icon');
    if (!icon) continue;
    const key = downloadIconKey(name);
    if (icon.dataset.lumiIcon === key) continue;
    icon.dataset.lumiIcon = key;
    icon.innerHTML = DOWNLOAD_ICONS[key] || DOWNLOAD_ICONS.file;
    icon.setAttribute('aria-label', `${key} icon`);
  }
}

function installDownloadIconObserver() {
  const install = () => {
    const style = document.createElement('style');
    style.textContent = '.file-icon{overflow:hidden;padding:2px}.file-icon svg{width:100%;height:100%;display:block}';
    document.head.appendChild(style);
    const list = document.getElementById('task-list');
    if (!list) return;
    refreshDownloadIcons(list);
    new MutationObserver(() => refreshDownloadIcons(list)).observe(list, { childList: true, subtree: true, characterData: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
}

installDownloadIconObserver();

contextBridge.exposeInMainWorld('lumiWidget', {
  snapshot: async () => {
    const [snapshot, capacity] = await Promise.all([
      ipcRenderer.invoke('v5-widget-snapshot'),
      ipcRenderer.invoke('v6-capacity-status').catch(() => ({ state: 'idle', result: null })),
    ]);
    return { ...(snapshot || {}), capacity };
  },
  toggleExpanded: () => ipcRenderer.invoke('v5-widget-toggle'),
  action: (action, taskId = '') => ipcRenderer.invoke('v5-widget-action', action, taskId),
  showMain: () => ipcRenderer.send('v5-widget-show-main'),
  onExpanded: (callback) => {
    const listener = (_event, value) => callback(Boolean(value));
    ipcRenderer.on('v5-expanded', listener);
    return () => ipcRenderer.removeListener('v5-expanded', listener);
  },
  onSettings: (callback) => {
    const listener = (_event, value) => callback(value || {});
    ipcRenderer.on('v5-settings-changed', listener);
    return () => ipcRenderer.removeListener('v5-settings-changed', listener);
  },
  onCapacity: (callback) => {
    const listener = (_event, value) => callback(value || {});
    ipcRenderer.on('v6-capacity-status', listener);
    return () => ipcRenderer.removeListener('v6-capacity-status', listener);
  },
});
