const { contextBridge, ipcRenderer } = require('electron');

// These are source assets, not recreated or approximated drawings.
// Android: official Android brand asset from Google.
// Rufus and Ventoy: official files from their project repositories.
// Windows, Ubuntu, Linux, Apple and Office: exact version-pinned brand SVG files.
const DOWNLOAD_ICONS = Object.freeze({
  windows: {
    type: 'mask',
    source: 'https://raw.githubusercontent.com/simple-icons/simple-icons/5.0.0/icons/windows.svg',
    color: '#0078D4',
    label: 'Windows',
  },
  ubuntu: {
    type: 'mask',
    source: 'https://raw.githubusercontent.com/simple-icons/simple-icons/070d5d580aacde3badabf0dd25cb8e818490f7a1/icons/ubuntu.svg',
    color: '#E95420',
    label: 'Ubuntu',
  },
  linux: {
    type: 'mask',
    source: 'https://raw.githubusercontent.com/simple-icons/simple-icons/5.0.0/icons/linux.svg',
    color: '#FCC624',
    label: 'Linux',
  },
  android: {
    type: 'image',
    source: 'https://developer.android.com/static/images/brand/android-head_flat.svg',
    label: 'Android',
  },
  apple: {
    type: 'mask',
    source: 'https://raw.githubusercontent.com/simple-icons/simple-icons/070d5d580aacde3badabf0dd25cb8e818490f7a1/icons/apple.svg',
    color: '#F5F5F7',
    label: 'Apple',
  },
  office: {
    type: 'mask',
    source: 'https://raw.githubusercontent.com/simple-icons/simple-icons/5.0.0/icons/microsoftoffice.svg',
    color: '#D83B01',
    label: 'Microsoft Office',
  },
  rufus: {
    type: 'image',
    source: 'https://raw.githubusercontent.com/pbatard/rufus/master/res/rufus.ico',
    label: 'Rufus',
  },
  ventoy: {
    type: 'image',
    source: 'https://raw.githubusercontent.com/ventoy/Ventoy/master/ICON/logo_256.png',
    label: 'Ventoy',
  },
  portableapps: {
    type: 'image',
    source: 'https://portableapps.com/favicon.ico',
    label: 'PortableApps.com',
  },
});

function downloadIconKey(fileName) {
  const name = String(fileName || '').toLowerCase();
  if (name.includes('ventoy')) return 'ventoy';
  if (name.includes('rufus')) return 'rufus';
  if (name.includes('office') || name.includes('microsoft 365') || name.includes('m365')) return 'office';
  if (name.includes('portableapps')) return 'portableapps';
  if (name.includes('ubuntu')) return 'ubuntu';
  if (name.includes('android') || name.endsWith('.apk') || name.endsWith('.aab')) return 'android';
  if (/\bwindows\b|\bwin(?:dows)?(?:10|11)\b|\bwin(?:10|11)_/.test(name)) return 'windows';
  if (
    name.includes('macos')
    || name.includes('os x')
    || name.includes('apple')
    || name.includes('iphone')
    || name.includes('ipad')
    || name.endsWith('.ipsw')
    || name.endsWith('.dmg')
    || name.endsWith('.pkg')
  ) return 'apple';
  if (
    name.includes('linux')
    || name.includes('debian')
    || name.includes('fedora')
    || name.includes('mint')
    || name.includes('archlinux')
  ) return 'linux';
  return '';
}

function fileExtension(fileName) {
  const cleanName = String(fileName || '').split(/[?#]/, 1)[0];
  const match = cleanName.match(/\.([a-z0-9]{1,5})$/i);
  return match ? match[1].toUpperCase() : 'FILE';
}

function renderFallbackIcon(icon, fileName) {
  icon.classList.remove('brand-icon');
  icon.classList.add('extension-icon');
  icon.replaceChildren();
  const badge = document.createElement('span');
  badge.className = 'file-extension';
  badge.textContent = fileExtension(fileName);
  icon.appendChild(badge);
  icon.setAttribute('aria-label', `${badge.textContent} file`);
}

function renderBrandIcon(icon, key, fileName) {
  const asset = DOWNLOAD_ICONS[key];
  if (!asset) {
    renderFallbackIcon(icon, fileName);
    return;
  }

  icon.classList.add('brand-icon');
  icon.classList.remove('extension-icon');
  icon.replaceChildren();

  if (asset.type === 'mask') {
    const mark = document.createElement('span');
    mark.className = 'brand-mask';
    mark.style.backgroundColor = asset.color;
    mark.style.webkitMaskImage = `url("${asset.source}")`;
    mark.style.maskImage = `url("${asset.source}")`;
    icon.appendChild(mark);
  } else {
    const image = document.createElement('img');
    image.src = asset.source;
    image.alt = '';
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => renderFallbackIcon(icon, fileName), { once: true });
    icon.appendChild(image);
  }

  icon.setAttribute('aria-label', `${asset.label} logo`);
}

function refreshDownloadIcons(root = document) {
  for (const row of root.querySelectorAll('.task-row')) {
    const name = row.querySelector('.task-name')?.textContent || '';
    const icon = row.querySelector('.file-icon');
    if (!icon) continue;

    const key = downloadIconKey(name);
    const signature = key || `extension:${fileExtension(name)}`;
    if (icon.dataset.lumiIcon === signature) continue;
    icon.dataset.lumiIcon = signature;

    if (key) renderBrandIcon(icon, key, name);
    else renderFallbackIcon(icon, name);
  }
}

function installDownloadIconObserver() {
  const install = () => {
    const style = document.createElement('style');
    style.textContent = `
      .file-icon {
        overflow: hidden;
      }
      .file-icon.brand-icon {
        padding: 1px;
        background: transparent;
        border-color: transparent;
      }
      .file-icon.brand-icon img,
      .file-icon .brand-mask {
        width: 100%;
        height: 100%;
        display: block;
        object-fit: contain;
      }
      .file-icon .brand-mask {
        -webkit-mask-repeat: no-repeat;
        mask-repeat: no-repeat;
        -webkit-mask-position: center;
        mask-position: center;
        -webkit-mask-size: contain;
        mask-size: contain;
      }
      .file-icon.extension-icon {
        padding: 2px;
      }
      .file-icon .file-extension {
        width: 100%;
        height: 100%;
        display: grid;
        place-items: center;
        border-radius: 5px;
        background: linear-gradient(145deg, rgba(129,52,255,.42), rgba(33,120,255,.25));
        color: #f5f7ff;
        font-size: 6.5px;
        font-weight: 800;
        letter-spacing: -.25px;
      }
    `;
    document.head.appendChild(style);

    const list = document.getElementById('task-list');
    if (!list) return;
    refreshDownloadIcons(list);
    new MutationObserver(() => refreshDownloadIcons(list)).observe(list, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
}

function installAttachedExpandControl() {
  const install = () => {
    const widget = document.getElementById('widget');
    const button = document.getElementById('expand-button');
    if (!widget || !button) return;

    document.body.appendChild(button);

    const style = document.createElement('style');
    style.textContent = `
      .widget {
        overflow: visible !important;
      }
      .compact-actions {
        position: static !important;
      }
      body > .expand {
        position: absolute !important;
        z-index: 50 !important;
        top: 0 !important;
        right: 12px !important;
        width: 28px !important;
        height: 16px !important;
        padding: 0 !important;
        border: 0 !important;
        background: transparent !important;
        display: grid !important;
        place-items: center !important;
        overflow: visible !important;
        cursor: pointer !important;
        -webkit-app-region: no-drag !important;
      }
      body > .expand::before {
        content: "" !important;
        position: absolute !important;
        inset: 0 !important;
        border: 1px solid rgba(190,116,255,.72) !important;
        border-radius: 9px 9px 6px 6px !important;
        background: linear-gradient(180deg, rgba(60,37,94,.99), rgba(16,17,38,.99)) !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.15), 0 -1px 7px rgba(141,64,255,.28), 0 3px 8px rgba(0,0,0,.38) !important;
        transition: border-color .18s, background .18s, box-shadow .18s, transform .18s !important;
      }
      body > .expand:hover::before {
        border-color: rgba(218,158,255,.92) !important;
        background: linear-gradient(180deg, rgba(78,46,119,.99), rgba(22,20,49,.99)) !important;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.2), 0 -1px 10px rgba(161,77,255,.38), 0 4px 10px rgba(0,0,0,.4) !important;
        transform: translateY(-1px) !important;
      }
      body > .expand:active::before {
        transform: translateY(1px) !important;
        box-shadow: inset 0 2px 4px rgba(0,0,0,.3), 0 2px 6px rgba(0,0,0,.32) !important;
      }
      body > .expand .chevron {
        position: relative !important;
        z-index: 1 !important;
        width: 7px !important;
        height: 7px !important;
        margin: 2px 0 0 !important;
        border-left: 2.8px solid #fff !important;
        border-top: 2.8px solid #fff !important;
        border-radius: 1px !important;
        transform: rotate(45deg) !important;
        filter: drop-shadow(0 1px 2px rgba(0,0,0,.62)) !important;
        transition: transform .18s !important;
      }
      body > .expand.is-expanded .chevron {
        margin-top: -2px !important;
        transform: rotate(225deg) !important;
      }
    `;
    document.head.appendChild(style);

    const sync = () => button.classList.toggle('is-expanded', widget.classList.contains('expanded'));
    sync();
    new MutationObserver(sync).observe(widget, { attributes: true, attributeFilter: ['class'] });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install, { once: true });
  } else {
    install();
  }
}

installDownloadIconObserver();
installAttachedExpandControl();

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
