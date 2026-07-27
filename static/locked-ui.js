"use strict";
(() => {
  const ICONS = {
    overview:'<svg viewBox="0 0 24 24"><path d="M3 10.8 12 3l9 7.8"/><path d="M5.4 9.8V21h5v-6h3.2v6h5V9.8"/></svg>',
    downloads:'<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 20h16"/></svg>',
    unfinished:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>',
    finished:'<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8 12 2.6 2.6L16.5 9"/></svg>',
    queues:'<svg viewBox="0 0 24 24"><path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4"/><path d="m4 17 8 4 8-4"/></svg>',
    categories:'<svg viewBox="0 0 24 24"><path d="M3 7.5h7l2-2h9v14H3z"/></svg>',
    grabber:'<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/></svg>',
    technician:'<svg viewBox="0 0 24 24"><path d="M14.7 6.3a4 4 0 0 0-5-5l2.1 2.1-2.4 2.4-2.1-2.1a4 4 0 0 0 5 5L20 16.4 16.4 20l-7.7-7.7"/></svg>',
    firmware:'<svg viewBox="0 0 24 24"><rect x="7" y="2" width="10" height="20" rx="1.8"/><path d="M10 5h4M11 19h2"/></svg>',
    operating_systems:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/></svg>'
  };
  const LOGOS = {
    Windows:'/static/brand/windows.svg', macOS:'/static/brand/apple.svg', Linux:'/static/brand/linux.svg', Ubuntu:'/static/brand/ubuntu.svg', Apple:'/static/brand/apple.svg', Android:'/static/brand/android.svg',
    Samsung:'https://cdn.simpleicons.org/samsung/1428A0', Xiaomi:'https://cdn.simpleicons.org/xiaomi/FF6900', Huawei:'https://cdn.simpleicons.org/huawei/FF0000', Honor:'https://cdn.simpleicons.org/honor/FFFFFF', OPPO:'https://cdn.simpleicons.org/oppo/2DAB66', Vivo:'https://cdn.simpleicons.org/vivo/415FFF', OnePlus:'https://cdn.simpleicons.org/oneplus/F5010C', Motorola:'https://cdn.simpleicons.org/motorola/5C92FA', Nokia:'https://cdn.simpleicons.org/nokia/124191', ZTE:'https://cdn.simpleicons.org/zte/00A5E2', Sony:'https://cdn.simpleicons.org/sony/FFFFFF', LG:'https://cdn.simpleicons.org/lg/A50034'
  };
  const svg = key => `<span class="locked-nav-icon">${ICONS[key] || ICONS.technician}</span>`;
  const labels = {overview:'Overview',downloads:'All Downloads',unfinished:'Unfinished',finished:'Finished',queues:'Queues',categories:'Categories',grabber:'LinkGrabber',firmware:'Mobile Firmware',operating_systems:'Operating Systems'};

  function patchSidebar() {
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
      if (item.dataset.lockedNav === 'true') return;
      const key = item.dataset.view;
      const count = item.querySelector('b')?.outerHTML || '';
      item.innerHTML = `${svg(key)}<span class="locked-nav-label">${labels[key] || key}</span>${count}`;
      item.dataset.lockedNav = 'true';
    });
    const toggle = document.querySelector('.nav-group-toggle');
    if (toggle && toggle.dataset.lockedNav !== 'true') {
      toggle.innerHTML = `${svg('technician')}<span class="locked-nav-label">Technician</span><span class="nav-chevron">›</span>`;
      toggle.dataset.lockedNav = 'true';
    }
  }

  const escHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const number = value => Number(value || 0);
  function logoForTask(task) {
    const name = String(task.filename || task.url || '').toLowerCase();
    if (name.includes('windows')) return LOGOS.Windows;
    if (name.includes('ubuntu')) return LOGOS.Ubuntu;
    if (name.includes('linux') || name.includes('debian') || name.includes('fedora')) return LOGOS.Linux;
    if (name.includes('macos') || name.includes('apple') || name.includes('iphone') || name.endsWith('.ipsw')) return LOGOS.Apple;
    if (name.includes('android') || name.endsWith('.apk')) return LOGOS.Android;
    if (name.includes('ventoy')) return 'https://raw.githubusercontent.com/ventoy/Ventoy/master/ICON/logo_256.png';
    return '/static/favicon-96.png';
  }
  function spark(color) { return `<svg class="locked-stat-spark" viewBox="0 0 180 34" preserveAspectRatio="none"><polyline points="0,22 12,27 24,20 36,24 48,18 60,25 72,21 84,24 96,17 108,26 120,19 132,23 144,16 156,25 168,21 180,24" style="stroke:${color}"/></svg>`; }
  function icon(type) {
    const marks = {download:'<path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/>',check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',total:'<path d="M12 3v12m-5-5 5 5 5-5M4 20h16"/>'};
    return `<svg viewBox="0 0 24 24">${marks[type]}</svg>`;
  }
  function stat(cssClass, label, value, note, type, color) {
    return `<article class="locked-stat ${cssClass}"><div class="locked-stat-top"><div class="locked-stat-icon">${icon(type)}</div><div class="locked-stat-copy"><small>${label}</small><strong>${value}</strong><span>${note}</span></div></div>${spark(color)}</article>`;
  }
  function navigate(view) {
    document.body.classList.toggle('lumi-overview-active', view === 'overview');
    if (typeof switchView === 'function') switchView(view);
  }

  function renderLockedOverview() {
    const element = document.getElementById('view-overview');
    if (!element) return;
    const tasks = typeof state !== 'undefined' && Array.isArray(state.tasks) ? state.tasks : [];
    const counts = typeof state !== 'undefined' ? state.overview?.counts || {} : {};
    const downloading = tasks.filter(task => ['running','resolving','verifying','post_processing'].includes(task.status)).length;
    const completed = number(counts.completed || tasks.filter(task => task.status === 'completed').length);
    const queued = number(counts.queued || tasks.filter(task => task.status === 'queued').length);
    const failed = number(counts.failed || tasks.filter(task => task.status === 'failed').length);
    const total = tasks.length || number(completed + downloading + queued + failed);
    const speed = typeof state !== 'undefined' ? number(state.overview?.total_speed_bytes_per_sec) : 0;
    const rate = typeof fmtRate === 'function' ? fmtRate(speed) : `${(speed / 1048576).toFixed(1)} MB/s`;
    const completedPct = total ? completed / total * 100 : 0;
    const downloadingPct = total ? downloading / total * 100 : 0;
    const queuedPct = total ? queued / total * 100 : 0;
    const recent = tasks.slice(0, 3);
    const bars = [42,58,73,47,68,54,81,65,59,78,62,72,86,63,69,77,55,82,66,74,88,61,70,79,57,72,64,77];
    const upload = typeof state !== 'undefined' ? number(state.overview?.upload_speed_bytes_per_sec) : 0;
    const uploadRate = typeof fmtRate === 'function' ? fmtRate(upload) : '0 B/s';
    const latency = typeof state !== 'undefined' ? number(state.overview?.latency_ms || 12) : 12;

    element.innerHTML = `<div class="locked-overview">
      <div class="locked-overview-head"><h2>Overview</h2><p>Complete summary of your download activity</p></div>
      <div class="locked-stat-grid">
        ${stat('purple','Total Downloads',total,'All time downloads','total','#9c2cff')}
        ${stat('blue','Downloading',downloading,'Active downloads','download','#1687ff')}
        ${stat('green','Completed',completed,'Successfully completed','check','#19c64d')}
        ${stat('orange','Queued',queued,'Waiting in queue','clock','#f27913')}
      </div>
      <div class="locked-overview-row">
        <section class="locked-panel"><div class="locked-panel-head"><h3>Download Speed</h3><button class="btn">This session⌄</button></div><div class="locked-speed-value">${escHtml(rate)}</div><div class="locked-speed-sub">Current speed</div><div class="locked-bars">${bars.map(height => `<i style="height:${height}%"></i>`).join('')}</div><div class="locked-speed-metrics"><div class="locked-speed-metric"><svg viewBox="0 0 24 24"><path d="M12 3v13m-5-5 5 5 5-5"/></svg><div><b>${escHtml(rate)}</b><small>Download</small></div></div><div class="locked-speed-metric"><svg viewBox="0 0 24 24"><path d="M12 21V8m-5 5 5-5 5 5"/></svg><div><b>${escHtml(uploadRate)}</b><small>Upload</small></div></div><div class="locked-speed-metric"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><div><b>${latency} ms</b><small>Latency</small></div></div></div></section>
        <section class="locked-panel"><div class="locked-panel-head"><h3>Downloads by Status</h3></div><div class="locked-status-wrap"><div class="locked-donut" style="--completed:${completedPct}%;--downloading:${completedPct + downloadingPct}%;--queued:${completedPct + downloadingPct + queuedPct}%"><div class="locked-donut-center"><strong>${total}</strong><span>Total</span></div></div><div class="locked-legend">${[['#14bf40','Completed',completed,completedPct],['#7514ed','Downloading',downloading,downloadingPct],['#ff760f','Queued',queued,queuedPct],['#566275','Failed',failed,total ? failed / total * 100 : 0]].map(item => `<div class="locked-legend-row"><i style="background:${item[0]}"></i><span>${item[1]}</span><strong>${item[2]} (${item[3].toFixed(1)}%)</strong></div>`).join('')}</div></div></section>
      </div>
      <div class="locked-overview-row">
        <section class="locked-panel"><div class="locked-panel-head"><h3>Recent Downloads</h3><button class="btn" data-action="view-all">View all</button></div><div class="locked-recent">${recent.length ? recent.map(task => `<div class="locked-recent-row"><div class="locked-recent-name"><img src="${logoForTask(task)}" alt=""><div class="locked-file-copy"><strong>${escHtml(task.filename || task.url || 'Download')}</strong><small>${escHtml(typeof fmtRate === 'function' ? fmtRate(number(task.speed_bytes_per_sec || 0)) : '0 B/s')} · ${escHtml(typeof fmtBytes === 'function' ? fmtBytes(number(task.downloaded_bytes || 0)) : '')}</small></div></div><strong class="locked-recent-pct">${Math.round(typeof progress === 'function' ? progress(task) : 0)}%</strong><span class="locked-pause">Ⅱ</span></div>`).join('') : '<div class="empty">No downloads yet</div>'}</div></section>
        <section class="locked-panel"><div class="locked-panel-head"><h3>Quick Actions</h3></div><div class="locked-quick-grid"><button class="locked-quick" id="locked-new-download"><svg viewBox="0 0 24 24"><path d="M12 4v16M4 12h16"/></svg><span>New Download</span></button><button class="locked-quick" id="locked-add-link"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20"/></svg><span>Add Link</span></button><button class="locked-quick" data-action="open-folder"><svg viewBox="0 0 24 24"><path d="M3 7.5h7l2-2h9v14H3z"/></svg><span>Open Folder</span></button><button class="locked-quick" id="locked-settings"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5L9 6a7 7 0 0 0-1.7 1L5 6 3 9.5 5 11a7 7 0 0 0 0 2l-2 1.5L5 18l2.3-1a7 7 0 0 0 1.7 1l.5 3h5l.5-3a7 7 0 0 0 1.7-1l2.3 1 2-3.5-2-1.5a7 7 0 0 0 0-1Z"/></svg><span>Settings</span></button><button class="locked-quick" id="locked-queues"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><span>Manage Queues</span></button><button class="locked-quick danger" data-action="clear-done"><svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/></svg><span>Clear Completed</span></button></div></section>
      </div>
    </div>`;

    document.body.classList.add('lumi-overview-active');
    element.querySelector('#locked-new-download')?.addEventListener('click', () => document.getElementById('new-download-btn')?.click());
    element.querySelector('#locked-add-link')?.addEventListener('click', () => document.getElementById('new-download-btn')?.click());
    element.querySelector('#locked-settings')?.addEventListener('click', () => navigate('settings'));
    element.querySelector('#locked-queues')?.addEventListener('click', () => navigate('queues'));
  }

  function setLogo(host, source, label) {
    if (!host || !source || host.dataset.lockedLogo === source) return;
    host.replaceChildren();
    const image = document.createElement('img');
    image.src = source;
    image.alt = label || '';
    host.appendChild(image);
    host.dataset.lockedLogo = source;
  }
  function brandFromText(value) {
    const text = String(value || '').toLowerCase();
    return Object.keys(LOGOS).find(brand => text.includes(brand.toLowerCase())) || (text.includes('ios') || text.includes('iphone') || text.includes('ipad') ? 'Apple' : text.includes('android') ? 'Android' : '');
  }
  function patchPlatformLogos(root = document) {
    root.querySelectorAll('[data-os-family]').forEach(card => setLogo(card.querySelector('.os-platform-icon'), LOGOS[card.dataset.osFamily], card.dataset.osFamily));
    root.querySelectorAll('.firmware-card').forEach(card => {
      const brand = brandFromText(card.textContent);
      if (brand) setLogo(card.querySelector('.firmware-source-icon'), LOGOS[brand], brand);
    });
    root.querySelectorAll('#view-firmware .empty-icon').forEach(host => setLogo(host, LOGOS.Android, 'Android'));
    root.querySelectorAll('#view-operating_systems .empty-icon').forEach(host => setLogo(host, LOGOS.Windows, 'Windows'));
  }

  function install() {
    patchSidebar();
    if (typeof window.renderOverview === 'function') {
      window.renderOverview = renderLockedOverview;
      try { renderOverview = renderLockedOverview; } catch (_) {}
    }
    if (typeof state !== 'undefined' && state.view === 'overview') renderLockedOverview();
    patchPlatformLogos();

    let pending = false;
    new MutationObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        patchSidebar();
        patchPlatformLogos();
        if (typeof state !== 'undefined' && state.view === 'overview' && !document.querySelector('.locked-overview')) renderLockedOverview();
      });
    }).observe(document.body, { subtree: true, childList: true });

    document.addEventListener('click', event => {
      const nav = event.target.closest('.nav-item[data-view]');
      if (nav) document.body.classList.toggle('lumi-overview-active', nav.dataset.view === 'overview');
    }, true);
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', () => setTimeout(install, 0));
  else setTimeout(install, 0);
})();