"use strict";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fmtGB = mb => mb >= 1024 ? `${(mb/1024).toFixed(mb%1024 ? 1 : 0)} GB` : `${mb.toFixed ? mb.toFixed(1) : mb} MB`;

const ICON_PATHS={
 home:'<path d="M3 10.8 12 3l9 7.8"/><path d="M5.4 9.8V21h5v-6h3.2v6h5V9.8"/>',
 download:'<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 20h16"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
 check:'<circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.6L16.5 9"/>',
 queue:'<path d="m12 3 8 4-8 4-8-4 8-4Z"/><path d="m4 12 8 4 8-4"/><path d="m4 17 8 4 8-4"/>',
 folder:'<path d="M3 7.5h7l2-2h9v14H3z"/>',
 link:'<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>',
 tools:'<path d="M14.7 6.3a4 4 0 0 0-5-5l2.1 2.1-2.4 2.4-2.1-2.1a4 4 0 0 0 5 5L20 16.4 16.4 20l-7.7-7.7"/>',
 phone:'<rect x="7" y="2" width="10" height="20" rx="1.8"/><path d="M10 5h4M11 19h2"/>',
 monitor:'<rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M8 21h8M12 17v4"/>',
 gear:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.5-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5L9 6a7 7 0 0 0-1.7 1L5 6 3 9.5 5 11a7 7 0 0 0 0 2l-2 1.5L5 18l2.3-1a7 7 0 0 0 1.7 1l.5 3h5l.5-3a7 7 0 0 0 1.7-1l2.3 1 2-3.5-2-1.5a7 7 0 0 0 .1-1Z"/>',
 bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/>',
 speed:'<circle cx="12" cy="12" r="9"/><path d="m12 12 4-4M7 16h10"/>',
 extension:'<path d="M8 3h4v4a2 2 0 1 0 4 0V3h5v6h-4a2 2 0 1 0 0 4h4v8h-8v-4a2 2 0 1 0-4 0v4H3v-7h4a2 2 0 1 0 0-4H3V3z"/>',
 refresh:'<path d="M20 7v5h-5"/><path d="M18.5 15a8 8 0 1 1-1-8.5L20 9"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.4 2.2c-.9.5-1.2 1.1-1.2 2M12 17h.01"/>',
 info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
 plus:'<path d="M12 4v16M4 12h16"/>',
 grid:'<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/>',
 upload:'<path d="M12 21V8m-5 5 5-5 5 5"/>',
};
function icon(name,cls=''){return `<svg class="icon-svg ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name]||ICON_PATHS.info}</svg>`}
function hydrateStaticIcons(){document.querySelectorAll('[data-icon]').forEach(node=>{node.innerHTML=icon(node.dataset.icon)})}
const safeLocal = { getItem(key){ try{return window.localStorage.getItem(key)}catch(_){return null} }, setItem(key,value){ try{window.localStorage.setItem(key,value)}catch(_){} } };

const fixtures = {
  tasks: [
    {id:"t1",name:"Windows 11 23H2 x64 EN-US.iso",category:"Operating Systems",source:"Official Site",downloaded:6.4,total:15.2,progress:45,speed:"6.4 MB/s",eta:"00:02:18",status:"downloading",icon:"windows",priority:"High"},
    {id:"t2",name:"Ventoy-1.0.99-Windows.zip",category:"Utilities",source:"GitHub",downloaded:1.3,total:1.7,progress:78,speed:"3.2 MB/s",eta:"00:01:07",status:"downloading",icon:"zip",priority:"Normal"},
    {id:"t3",name:"ubuntu-24.04.1-desktop-amd64.iso",category:"Operating Systems",source:"Official Site",downloaded:.325,total:2.6,progress:12,speed:"2.8 MB/s",eta:"00:13:45",status:"downloading",icon:"ubuntu",priority:"Normal"},
    {id:"t4",name:"Photoshop_2024_25.6.0.706.zip",category:"Software",source:"Google Drive",downloaded:0,total:3.5,progress:0,speed:"—",eta:"—",status:"queued",icon:"ps",priority:"Low"},
    {id:"t5",name:"Adobe_Premiere_Pro_2024.zip",category:"Software",source:"Google Drive",downloaded:0,total:2.1,progress:0,speed:"—",eta:"—",status:"queued",icon:"pr",priority:"Low"},
    {id:"t6",name:"VSCodiumSetup-x64-1.86.2.exe",category:"Software",source:"Official Site",downloaded:.0954,total:.0954,progress:100,speed:"—",eta:"Completed",status:"completed",icon:"check",priority:"Normal",finished:"May 25, 2025, 12:41 PM",checksum:"Verified"},
    {id:"t7",name:"Intel-Driver-and-Support-Assistant.exe",category:"Drivers",source:"Official Site",downloaded:.0187,total:.0187,progress:100,speed:"—",eta:"Completed",status:"completed",icon:"check",priority:"Normal",finished:"May 25, 2025, 12:13 PM",checksum:"Verified"},
    {id:"t8",name:"Python-3.12.2-amd64.exe",category:"Software",source:"Official Site",downloaded:0,total:.0286,progress:0,speed:"—",eta:"Failed",status:"failed",icon:"fail",priority:"High"},
    {id:"t9",name:"GTA_V_1.0.3095.0_Installer.7z",category:"Games",source:"Official Site",downloaded:0,total:96.4,progress:0,speed:"Paused",eta:"Paused",status:"paused",icon:"7z",priority:"Low"},
    {id:"t10",name:"CompTIA_A+_Study_Guide.pdf",category:"Documents",source:"Manual",downloaded:0,total:.084,progress:0,speed:"Paused",eta:"Paused",status:"paused",icon:"pdf",priority:"Low"},
    {id:"t11",name:"Fedora-Workstation-40-x86_64.iso",category:"Operating Systems",source:"Official Site",downloaded:0,total:2.1,progress:0,speed:"—",eta:"In queue",status:"queued",icon:"iso",priority:"Low"},
    {id:"t12",name:"DriverPack_17.11.106.zip",category:"Drivers",source:"Official Site",downloaded:0,total:18.3,progress:0,speed:"Retrying...",eta:"—",status:"failed",icon:"zip",priority:"High"},
  ],
  queues: [
    {id:"q1",name:"Windows 11 23H2 x64 EN-US.iso",category:"Operating Systems",source:"Microsoft",size:"6.2 GB",status:"Waiting",priority:"High",scheduled:"—"},
    {id:"q2",name:"Ventoy-1.0.99-Windows.zip",category:"Utilities",source:"ventoy.net",size:"1.7 GB",status:"Waiting",priority:"High",scheduled:"—"},
    {id:"q3",name:"ubuntu-24.04.1-desktop-amd64.iso",category:"Operating Systems",source:"ubuntu.com",size:"2.6 GB",status:"Scheduled",priority:"Normal",scheduled:"May 14, 2024\n10:00 PM"},
    {id:"q4",name:"Fedora-Workstation-Live-x86_64.iso",category:"Operating Systems",source:"getfedora.org",size:"2.1 GB",status:"Ready",priority:"Low",scheduled:"—"},
    {id:"q5",name:"Windows 10 22H2 x64.iso",category:"Operating Systems",source:"Microsoft",size:"5.4 GB",status:"Ready",priority:"Low",scheduled:"—"},
  ],
  categories: [
    ["Operating Systems","32 downloads","145.6 GB","D:\\Downloads\\OS","⊞","os",".iso, .img, .dmg, .vhd, .vhdx, .wim, .esd"],
    ["Mobile Firmware","28 downloads","32.4 GB","D:\\Downloads\\Firmware","▯","util",".zip, .tar, .tar.md5, .md5, .bin, .ap, .pac"],
    ["Utilities","41 downloads","18.7 GB","D:\\Downloads\\Utilities","🛠","image",".exe, .msi, .bat, .cmd, .ps1, .tool, .jar"],
    ["Documents","26 downloads","2.4 GB","D:\\Downloads\\Documents","▤","doc",".pdf, .doc, .docx, .xls, .xlsx, .ppt, .txt"],
    ["Archives","35 downloads","24.8 GB","D:\\Downloads\\Archives","ZIP","doc",".zip, .rar, .7z, .tar, .gz, .bz2, .xz"],
    ["Drivers","22 downloads","5.6 GB","D:\\Downloads\\Drivers","⚙","os",".inf, .sys, .cat, .drv, .oem, .dll"],
    ["Video","18 downloads","78.3 GB","D:\\Downloads\\Video","▣","doc",".mp4, .mkv, .avi, .mov, .wmv, .flv, .m4v"],
    ["Audio","16 downloads","6.3 GB","D:\\Downloads\\Audio","♫","util",".mp3, .aac, .flac, .wav, .wma, .ogg, .m4a"],
    ["Other","14 downloads","8.1 GB","D:\\Downloads\\Other","◇","image","*.* (unmatched files)"],
  ],
  links: [
    ["Windows 11 23H2 x64 EN-US","microsoft.com","5","6.2 GB","Operating Systems"],
    ["Ventoy 1.0.99","ventoy.net","3","1.7 GB","Utilities"],
    ["Ubuntu 24.04.1 Desktop AMD64","releases.ubuntu.com","4","2.6 GB","Operating Systems"],
    ["Visual Studio Code 1.89.1","code.visualstudio.com","2","168 MB","Software"],
    ["7-Zip 23.01 (x64)","7-zip.org","2","5.6 MB","Utilities"],
    ["Google Chrome 125.0.6422.112","dl.google.com","7","134 MB","Browsers"],
  ],
  firmware: [
    ["Galaxy S24 Ultra","SM-S928B","S928BXXU3AXE7","Android 14","XEU","Europe","Official ROM","One UI 6.1","5.23 GB","May 08, 2024","Signed"],
    ["Galaxy S24 Ultra","SM-S928B","S928BXXU3AXD9","Android 14","INS","India","Official ROM","One UI 6.1","5.19 GB","Apr 28, 2024","Signed"],
    ["Galaxy S24 Ultra","SM-S928B","S928BXXU3AXC5","Android 14","TGY","Turkey","OTA Update","Incremental","812 MB","Apr 22, 2024","Signed"],
    ["Galaxy S24 Ultra","SM-S928B","S928BXXU3AXB2","Android 14","EUX","Europe","Flash File","Odin","5.18 GB","Apr 15, 2024","Signed"],
    ["Galaxy S24 Ultra","SM-S928B","S928BXXU2AXA8","Android 14","XSG","Singapore","Official ROM","One UI 6.0","4.95 GB","Mar 28, 2024","Signed"],
    ["Galaxy S24 Ultra","SM-S928B","S928BXXU1AWM9","Android 14","EUX","Europe","Official ROM","One UI 6.0","4.88 GB","Mar 12, 2024","Signed"],
  ],
  os: [
    ["Windows 11 23H2","Latest","Home/Pro","x64","Release Preview","5.24 GB","22631.3880"],
    ["Windows 11 22H2","","Home/Pro","x64","GA","5.12 GB","22621.2861"],
    ["Windows 10 22H2","","Home/Pro","x64","GA","4.91 GB","19045.4046"],
    ["Windows 10 21H2","","Home/Pro","x64","GA","4.76 GB","19044.2846"],
    ["Windows 10 20H2","","Home/Pro","x64","GA","4.69 GB","19042.631"],
  ]
};

const state = {
  view: "overview",
  search: "",
  status: "all",
  theme: safeLocal.getItem("lumi.theme") || "dark",
  tasks: structuredClone(fixtures.tasks),
  queues: structuredClone(fixtures.queues),
  categories: structuredClone(fixtures.categories),
  links: structuredClone(fixtures.links),
  firmware: structuredClone(fixtures.firmware),
  os: structuredClone(fixtures.os),
  gearOpen: false,
  speedTestRunning: false,
  extension: {chrome:"Connected",edge:"Installed",firefox:"Not Installed"},
  productionReady:false,
  settings:{default_dir:"",default_connections:16,max_concurrent:3},
  overview:{},
};

const meta = {
  overview:["Overview","Complete summary of your download activity"],
  downloads:["All Downloads","Manage and monitor all your downloads in one place"],
  unfinished:["Unfinished","Unfinished, paused, and in-progress downloads."],
  finished:["Finished","View and manage your completed downloads."],
  queues:["Queues","Manage your queued downloads and their execution order."],
  categories:["Categories","Organize your downloads by type for better management and automatic sorting."],
  grabber:["LinkGrabber","Collect and prepare links from the web for faster, organized downloads."],
  firmware:["Mobile Firmware","Download official ROMs, OTA packages, flash files, and IPSW for your devices."],
  "operating-systems":["Operating Systems","Official Windows, macOS and Linux installation files"],
  settings:["Settings","Customize Lumi to match your workflow and preferences."],
  "browser-extension":["Browser Extension","Connect Lumi with your browser to capture downloads, monitor links, and send them directly to LinkGrabber."],
  help:["Help / Report a Bug","We're here to help. Find answers, get support, or report an issue."],
  about:["About Lumi","Learn more about Lumi Download Manager"],
};

function spark(color="#9d22ff"){
  return `<svg class="spark" viewBox="0 0 200 30" preserveAspectRatio="none"><polyline points="0,20 8,24 16,17 24,22 32,14 40,23 48,18 56,21 64,13 72,24 80,15 88,21 96,12 104,23 112,17 120,20 128,11 136,25 144,16 152,22 160,13 168,23 176,17 184,20 192,12 200,18" stroke="${color}"/></svg>`;
}
function statCard(css,title,value,note,symbol,color){
  return `<article class="stat-card ${css}"><div class="stat-top"><div class="stat-icon">${symbol}</div><div class="stat-copy"><small>${esc(title)}</small><strong>${esc(value)}</strong><span>${esc(note)}</span></div></div>${spark(color)}</article>`;
}
function fileIcon(type){ return `<span class="file-icon ${esc(type)}">${({windows:"⊞",zip:"ZIP",ubuntu:"◉",pdf:"PDF",iso:"ISO",check:"✓",fail:"×",ps:"Ps",pr:"Pr","7z":"7z"}[type]||"↓")}</span>`; }
function taskStatusLabel(s){return ({downloading:"Downloading",queued:"Queued",completed:"Completed",failed:"Failed",paused:"Paused"}[s]||s)}
function pillClass(category){if(category.includes("Operating"))return"os";if(category.includes("Util"))return"util";if(category.includes("Image"))return"image";if(category.includes("Doc"))return"doc";return"util"}
function toast(message,type=""){
  const node=document.createElement("div"); node.className=`toast ${type}`; node.textContent=message; $("#toast-stack").append(node); setTimeout(()=>node.remove(),2800);
}
function closeTransient(){
  $("#gear-menu").hidden=true; $("#gear-button").setAttribute("aria-expanded","false"); state.gearOpen=false;
}
function showModal(html,wide=false){
  $("#overlay").hidden=false; const modal=$("#modal"); modal.hidden=false; modal.classList.toggle("wide",wide); modal.innerHTML=html;
}
function closeModal(){ $("#overlay").hidden=true; $("#modal").hidden=true; $("#modal").innerHTML=""; }
function modalHeader(title){return `<div class="modal-head"><h2>${esc(title)}</h2><button class="modal-close" data-close-modal>×</button></div>`}

function render(){
  document.body.classList.toggle("light-glass",state.theme==="light");
  $$(".nav-item[data-view]").forEach(b=>b.classList.toggle("active",b.dataset.view===state.view));
  const content=$("#content");
  switch(state.view){
    case "overview": content.innerHTML=renderOverview(); break;
    case "downloads": content.innerHTML=renderDownloads("all"); break;
    case "unfinished": content.innerHTML=renderDownloads("unfinished"); break;
    case "finished": content.innerHTML=renderFinished(); break;
    case "queues": content.innerHTML=renderQueues(); break;
    case "categories": content.innerHTML=renderCategories(); break;
    case "grabber": content.innerHTML=renderGrabber(); break;
    case "firmware": content.innerHTML=renderFirmware(); break;
    case "operating-systems": content.innerHTML=renderOS(); break;
    case "settings": content.innerHTML=renderSettings(); break;
    case "browser-extension": content.innerHTML=renderBrowserExtension(); break;
    case "help": content.innerHTML=renderHelp(); break;
    case "about": content.innerHTML=renderAbout(); break;
    default: content.innerHTML=renderOverview();
  }
  content.scrollTop=0;
}
function pageHead(view,actions=""){
  const [title,sub]=meta[view];
  return `<div class="page-head"><div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div><div class="page-actions">${actions}</div></div>`;
}

function renderOverview(){
  const recent=state.tasks.slice(0,3);
  const bars=[36,55,72,45,63,52,78,62,56,81,60,69,86,59,65,76,53,82,64,72,88,57,68,77,54,71,60,74];
  return `<div class="page">${pageHead("overview")}
    <div class="stat-grid">
      ${statCard("","TOTAL DOWNLOADS","174","All time downloads",icon("download"),"#9d22ff")}
      ${statCard("blue","DOWNLOADING","3","Active downloads",icon("download"),"#00a2ff")}
      ${statCard("green","COMPLETED","156","Successfully completed",icon("check"),"#10db42")}
      ${statCard("orange","QUEUED","2","Waiting in queue",icon("clock"),"#ff780c")}
    </div>
    <div class="overview-grid">
      <section class="panel"><div class="panel-head"><h2>DOWNLOAD SPEED</h2><button class="btn small">This session⌄</button></div><div class="speed-body"><div class="speed-value">6.4 <small>MB/s</small></div><div class="speed-sub">Current speed</div><div class="speed-chart"><div class="speed-axis"><span>10 MB/s</span><span>7.5 MB/s</span><span>5 MB/s</span><span>2.5 MB/s</span><span>0</span></div><div class="bars-wrap">${bars.map(v=>`<i style="height:${v}%"></i>`).join("")}</div></div><div class="chart-labels"><span>60s</span><span>50s</span><span>40s</span><span>30s</span><span>20s</span><span>10s</span><span>Now</span></div><div class="speed-metrics"><div class="speed-metric"><span class="glyph">⇩</span><div><b>6.4 MB/s</b><small>Download</small></div></div><div class="speed-metric"><span class="glyph">↑</span><div><b>0.3 MB/s</b><small>Upload</small></div></div><div class="speed-metric"><span class="glyph">◷</span><div><b>12 ms</b><small>Latency</small></div></div></div></div></section>
      <section class="panel"><div class="panel-head"><h2>DOWNLOADS BY STATUS</h2></div><div class="status-body"><div class="donut" style="--c1:89.7%;--c2:91.4%;--c3:92.5%"><strong>174</strong><span>Total</span></div><div class="legend"><div class="legend-row"><i style="background:#13d141"></i><span>Completed</span><strong>156&nbsp;&nbsp;(89.7%)</strong></div><div class="legend-row"><i style="background:#6a12df"></i><span>Downloading</span><strong>3&nbsp;&nbsp;(1.7%)</strong></div><div class="legend-row"><i style="background:#ff790c"></i><span>Queued</span><strong>2&nbsp;&nbsp;(1.1%)</strong></div><div class="legend-row"><i style="background:#56627a"></i><span>Failed</span><strong>13&nbsp;&nbsp;(7.5%)</strong></div></div></div></section>
    </div>
    <div class="overview-grid">
      <section class="panel"><div class="panel-head"><h2>RECENT DOWNLOADS</h2><button class="btn small" data-view-jump="downloads">View all</button></div><div class="recent-list">${recent.map(t=>`<div class="recent-row" data-task-row="${t.id}"><div class="file-cell">${fileIcon(t.icon)}<div class="file-copy"><strong>${esc(t.name)}</strong><small><em>↓${esc(t.speed)}</em> · ${esc(t.downloaded)} GB / ${esc(t.total)} GB</small></div></div><b>${t.progress}%</b><button class="pause-ring" data-task-action="${t.status==='downloading'?'pause':'resume'}" data-task="${t.id}">${t.status==='downloading'?'Ⅱ':'▶'}</button></div>`).join("")}</div></section>
      <section class="panel"><div class="panel-head"><h2>QUICK ACTIONS</h2></div><div class="quick-grid"><button class="quick-card" data-open-new>${icon("plus","quick-icon")}<span>New Download</span></button><button class="quick-card" data-open-link>${icon("link","quick-icon")}<span>Add Link</span></button><button class="quick-card" data-open-folder>${icon("folder","quick-icon")}<span>Open Folder</span></button><button class="quick-card" data-control-jump="settings">${icon("gear","quick-icon")}<span>Settings</span></button><button class="quick-card" data-view-jump="queues">${icon("clock","quick-icon")}<span>Manage Queues</span></button><button class="quick-card" data-view-jump="categories">${icon("grid","quick-icon")}<span>Categories</span></button></div></section>
    </div>
  </div>`;
}

function filterTasks(kind){
  let list=[...state.tasks];
  if(kind==="unfinished") list=list.filter(t=>!["completed"].includes(t.status));
  if(state.search) list=list.filter(t=>Object.values(t).join(" ").toLowerCase().includes(state.search));
  if(state.status!=="all") list=list.filter(t=>t.status===state.status || (state.status==="downloading"&&t.status==="downloading"));
  return list;
}
function renderDownloads(kind){
  const list=filterTasks(kind);
  const title=kind==="all"?"downloads":"unfinished";
  const cards=kind==="all"?[
    statCard("blue","ACTIVE","3","Currently downloading","⇩","#00a2ff"),
    statCard("orange","QUEUED","2","Waiting in queue",icon("clock"),"#ff790c"),
    statCard("green","COMPLETED","156","Successfully completed",icon("check"),"#10db42"),
    statCard("red","FAILED","13","Download failed","×","#ff3247")
  ]:[
    statCard("blue","DOWNLOADING","3","Active downloads",icon("download"),"#00a2ff"),
    statCard("orange","PAUSED","2","Paused downloads","Ⅱ","#ff790c"),
    statCard("orange","QUEUED","2","Waiting in queue",icon("clock"),"#ff790c"),
    statCard("red","FAILED RETRY","1","Retrying failed","↻","#ff3247")
  ];
  return `<div class="page">${pageHead(title,kind==="all"?'<button class="btn primary" data-open-new>＋ New Download</button><button class="btn" data-open-link>↗ Add Link</button>':"")}
    <div class="stat-grid">${cards.join("")}</div>
    ${kind==="all"?`<div class="filters"><label class="search-control"><span>⌕</span><input data-local-search placeholder="Search downloads..."></label>${["all","downloading","queued","completed","failed"].map(s=>`<button class="btn small ${state.status===s?'primary':''}" data-status-filter="${s}">${s==='all'?'All Status':taskStatusLabel(s)}</button>`).join("")}<button class="btn small">All Categories⌄</button><button class="btn small">All Sources⌄</button><button class="btn small">Newest First⌄</button><button class="btn icon-button" data-refresh>↻</button></div>`:""}
    <section class="table-panel"><div class="table-scroll"><table class="data-table"><thead><tr><th class="file-col">${kind==="all"?'File':'Name'}</th>${kind==="all"?'<th>Category</th><th>Source</th>':''}<th>Progress</th><th>Speed</th><th>ETA</th><th>Size</th>${kind!=="all"?'<th>Source</th><th>Priority</th>':''}<th>Status</th><th class="actions-col">Actions</th></tr></thead><tbody>${list.map(t=>downloadTableRow(t,kind)).join("")}</tbody></table></div><div class="table-footer"><span>Showing 1 to ${list.length} of ${list.length} ${kind==='all'?'downloads':'items'}</span><div class="pagination"><button class="page-button">‹</button><button class="page-button active">1</button><button class="page-button">›</button><button class="btn small">20 / page⌄</button></div></div></section>
  </div>`;
}
function downloadTableRow(t,kind){
  const priority=`<span class="priority-pill ${t.priority.toLowerCase()}">${t.priority==='High'?'↑ ':''}${t.priority}</span>`;
  const status=`<span class="status-pill ${t.status}">${taskStatusLabel(t.status)}</span>`;
  const main=`<td><div class="file-cell">${fileIcon(t.icon)}<div class="file-copy"><strong>${esc(t.name)}</strong><small>${esc(t.downloaded)} GB / ${esc(t.total)} GB</small></div></div></td>`;
  const progress=`<td><div class="progress-cell"><span>${t.progress}%</span><div class="progress-track"><div class="progress-fill ${t.status==='completed'?'green':''}" style="width:${t.progress}%"></div></div></div></td>`;
  const actions=`<td class="actions-col"><div class="action-icons"><button class="mini-action round" data-task-action="${t.status==='downloading'?'pause':t.status==='paused'?'resume':t.status==='failed'?'retry':'open'}" data-task="${t.id}">${t.status==='downloading'?'Ⅱ':t.status==='completed'?'□':'▶'}</button><button class="mini-action" data-task-menu="${t.id}">⋮</button></div></td>`;
  if(kind==="all") return `<tr>${main}<td>${esc(t.category)}</td><td>${esc(t.source)}</td>${progress}<td>${esc(t.speed)}</td><td>${esc(t.eta)}</td><td>${esc(t.total)} GB</td><td>${status}</td>${actions}</tr>`;
  return `<tr>${main}${progress}<td>${esc(t.speed)}</td><td>${esc(t.eta)}</td><td>${esc(t.total)} GB</td><td>${esc(t.source)}</td><td>${priority}</td><td>${status}</td>${actions}</tr>`;
}
function renderFinished(){
  const completed=[
    ["Windows 11 23H2 x64 EN-US.iso","May 25, 2025, 2:28 PM","6.2 GB","Operating Systems","Microsoft","windows"],
    ["Ventoy-1.0.99-Windows.zip","May 25, 2025, 2:34 PM","1.7 GB","Utilities","ventoy.net","zip"],
    ["ubuntu-24.04.1-desktop-amd64.iso","May 25, 2025, 1:45 PM","2.6 GB","Operating Systems","Ubuntu","ubuntu"],
    ["Screenshot_2025-05-25_13-22-10.png","May 25, 2025, 1:22 PM","1.2 MB","Images","Manual","image"],
    ["7z2409-x64.exe","May 25, 2025, 12:58 PM","1.5 MB","Utilities","7-Zip","zip"],
    ["rufus-4.5.exe","May 25, 2025, 12:41 PM","1.4 MB","Utilities","Rufus.ie","zip"],
    ["Lumi_Release_Notes_v2.1.0.pdf","May 25, 2025, 11:37 AM","2.3 MB","Documents","TheTechGuy","pdf"],
    ["VirtualBox-7.0.14-161095-Win.exe","May 25, 2025, 10:53 AM","105 MB","Utilities","VirtualBox","zip"],
    ["Lumi_Theme_Preview.png","May 25, 2025, 10:12 AM","3.6 MB","Images","Manual","image"],
    ["ubuntu-22.04.4-live-server-amd64.iso","May 25, 2025, 9:48 AM","1.4 GB","Operating Systems","Ubuntu","ubuntu"],
  ];
  return `<div class="page">${pageHead("finished")}
    <div class="stat-grid">${statCard("green","COMPLETED TODAY","8","Downloads","✓","#13d141")}${statCard("blue","TOTAL COMPLETED","156","All time downloads","⇩","#00a2ff")}${statCard("","LAST COMPLETED","Today, 2:34 PM","Ventoy-1.0.99-Windows.zip","◷","#9d22ff")}${statCard("orange","STORAGE USED","263.4 GB","Across all completed files","▣","#ff790c")}</div>
    <section class="table-panel"><div class="panel-head"><h2>COMPLETED DOWNLOADS</h2></div><table class="data-table"><thead><tr><th class="file-col">File Name</th><th>Finished On</th><th>Size</th><th>Category</th><th>Source</th><th>Checksum</th><th class="actions-col">Actions</th></tr></thead><tbody>${completed.map((r,i)=>`<tr><td><div class="file-cell">${fileIcon(r[5])}<div class="file-copy"><strong>${esc(r[0])}</strong></div></div></td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td><span class="category-pill ${pillClass(r[3])}">${esc(r[3])}</span></td><td>${esc(r[4])}</td><td style="color:#15d640">✓ Verified</td><td class="actions-col"><div class="action-icons"><button class="mini-action">↗</button><button class="mini-action">□</button><button class="mini-action">◯</button><button class="mini-action red" data-delete-complete="${i}">▣</button></div></td></tr>`).join("")}</tbody></table><div class="table-footer"><span>Showing 1 to 10 of 156 entries</span><div class="pagination"><button class="page-button">«</button><button class="page-button">‹</button><button class="page-button active">1</button><button class="page-button">2</button><button class="page-button">3</button><button class="page-button">4</button><button class="page-button">5</button><span>…</span><button class="page-button">16</button><button class="page-button">›</button><button class="page-button">»</button></div><span>Rows per page&nbsp;&nbsp;<button class="btn small">10⌄</button></span></div></section>
  </div>`;
}
function renderQueues(){
  return `<div class="page">${pageHead("queues")}
    <div class="queue-top">${statCard("orange","WAITING","2","In queue","◷","#ff790c")}${statCard("blue","SCHEDULED","1","Scheduled","▦","#00a2ff")}${statCard("","PRIORITY","High","Current mode","⚑","#9d22ff")}${statCard("green","AUTO-START","Enabled","When downloads finish","▶","#13d141")}<section class="queue-rule-card"><h3>⚙ QUEUE RULES</h3><label>Max simultaneous downloads <input class="number-input" type="number" value="3"></label><label><input type="checkbox" checked> Start next queue automatically</label><label><input type="checkbox"> Stop queue on completion</label><label><input type="checkbox" checked> Respect download limits</label><button class="btn small" data-edit-queue-rules>Edit Queue Rules</button></section></div>
    <section class="table-panel"><table class="data-table"><thead><tr><th>#</th><th class="file-col">Queue Name / File</th><th>Category</th><th>Source</th><th>Size</th><th>Status</th><th>Priority</th><th>Scheduled</th><th class="actions-col">Actions</th></tr></thead><tbody>${state.queues.map((q,i)=>`<tr><td>${i+1}</td><td><div class="file-copy"><strong>${esc(q.name)}</strong><small>${q.category.replace('Operating Systems','Windows')} · ${q.name.endsWith('.zip')?'ZIP':'ISO'}</small></div></td><td>▰ ${esc(q.category)}</td><td>◎ ${esc(q.source)}</td><td>${esc(q.size)}</td><td>${q.status==='Waiting'?'🕘':q.status==='Scheduled'?'▣':'▶'} ${esc(q.status)}</td><td><span class="priority-pill ${q.priority.toLowerCase()}">${esc(q.priority)}</span></td><td style="white-space:pre-line">${esc(q.scheduled)}</td><td class="actions-col"><div class="action-icons"><button class="mini-action" data-queue-move="up" data-queue="${q.id}">↑</button><button class="mini-action" data-queue-move="down" data-queue="${q.id}">↓</button><button class="mini-action" data-queue-pause="${q.id}">Ⅱ</button><button class="mini-action" data-queue-start="${q.id}">▶</button><button class="mini-action" data-queue-delete="${q.id}">▣</button></div></td></tr>`).join("")}</tbody></table><div class="table-footer"><span>Showing 1 to 5 of 5 queues</span><strong>Total Queued Size:&nbsp;&nbsp;18.0 GB</strong></div></section>
    <div class="legend-bar"><strong>ACTIONS LEGEND</strong><span>↑ Move Up</span><span>↓ Move Down</span><span>Ⅱ Pause Queue</span><span>▶ Start Now</span><span>▣ Remove from Queue</span></div>
  </div>`;
}
function renderCategories(){
  return `<div class="page">${pageHead("categories")}
    <div class="category-cards">${state.categories.map(c=>`<article class="category-card"><div class="row"><div class="cat-icon">${c[4]}</div><div><h3>${esc(c[0])}</h3><p>${esc(c[1])}</p><p>${esc(c[2])}</p></div></div><code>${esc(c[3])}</code></article>`).join("")}</div>
    <section class="table-panel"><table class="data-table"><thead><tr><th>Category</th><th style="width:31%">Rules (File Extensions)</th><th>Action</th><th style="width:23%">Default Location</th><th class="actions-col">Actions</th></tr></thead><tbody>${state.categories.map((c,i)=>`<tr><td>${c[4]} &nbsp;${esc(c[0])}</td><td>${esc(c[6])}</td><td>Move to category</td><td>${esc(c[3])}</td><td class="actions-col"><div class="action-icons"><button class="mini-action" data-category-edit="${i}">✎</button><button class="mini-action" data-open-folder>□</button><button class="mini-action" data-category-star="${i}">☆</button></div></td></tr>`).join("")}</tbody></table></section>
  </div>`;
}
function renderGrabber(){
  return `<div class="page">${pageHead("grabber")}
    <div class="grabber-layout"><div><section class="panel paste-panel"><div class="dropzone" id="link-dropzone"><div><div class="chain">↗</div><strong>Paste links here, one per line</strong><small>You can also drag and drop a text file or .txt</small></div></div><div class="grab-actions"><button class="btn" data-paste-links>▣ Paste Links</button><button class="btn" data-scan-clipboard>▤ Scan Clipboard</button><button class="btn" data-import-file>□ Import File</button><button class="btn blue" data-grab-links>⇩ Grab Links</button></div></section><section class="table-panel" style="margin-top:14px"><div class="panel-head"><h2>DETECTED LINKS (6 PACKAGES, 23 FILES)</h2></div><table class="data-table"><thead><tr><th class="file-col">Package Name</th><th>Source</th><th>Files</th><th>Total Size</th><th>Category</th><th>Status</th><th class="actions-col">Actions</th></tr></thead><tbody>${state.links.map((l,i)=>`<tr><td>${esc(l[0])}</td><td>${esc(l[1])}</td><td>${esc(l[2])}</td><td>${esc(l[3])}</td><td><span class="category-pill ${pillClass(l[4])}">${esc(l[4])}</span></td><td style="color:#23d346">● &nbsp;Ready</td><td class="actions-col"><div class="action-icons"><button class="mini-action" data-add-grabbed="${i}">＋</button><button class="mini-action" data-edit-grabbed="${i}">✎</button><button class="mini-action" data-delete-grabbed="${i}">▣</button></div></td></tr>`).join("")}</tbody></table><div class="table-footer"><span>ⓘ &nbsp;6 packages, 23 files</span><span>Total size: 10.8 GB</span></div></section></div>
      <aside class="panel options-panel"><div class="option-section"><h3>LINK OPTIONS</h3><label><span><input type="checkbox" checked> Remove duplicates</span></label><label><span><input type="checkbox" checked> Validate links</span></label><label><span><input type="checkbox" checked> Follow redirects</span></label><label>Timeout (seconds)<input type="number" value="30"></label></div><div class="option-section"><h3>AUTO-GROUPING</h3><label>Group by<select><option>Domain</option></select></label><label>Split large packages<span class="toggle on" data-toggle></span></label><label>Max files per package<input type="number" value="50"></label></div><div class="option-section"><h3>DESTINATION CATEGORY</h3><label>Default category<select><option>Auto Detect</option></select></label><small style="color:#929bad;line-height:1.5">Detected links will be assigned a category automatically based on content.</small></div><div class="option-section"><h3>ADVANCED</h3><label>Ignore file types<input type="text" placeholder="e.g., .nfo, .txt"></label><small style="color:#929bad">Comma separated</small></div></aside>
    </div>
  </div>`;
}
function renderFirmware(){
  return `<div class="page">${pageHead("firmware")}
    <div class="tabs"><button class="tab active">♟ &nbsp;Android</button><button class="tab">● &nbsp;iPhone / iPad</button></div>
    <div class="firmware-filters"><label>Brand&nbsp;&nbsp;<select class="control"><option>Samsung</option></select></label><label>Model&nbsp;&nbsp;<select class="control wide"><option>Galaxy S24 Ultra (SM-S928B)</option></select></label><label>Region&nbsp;&nbsp;<select class="control"><option>All</option></select></label><label>Type&nbsp;&nbsp;<select class="control"><option>All</option></select></label><label class="search-control firmware-search"><input placeholder="Search firmware..."><span>⌕</span></label></div>
    <section class="table-panel"><table class="data-table"><thead><tr><th class="file-col">Device</th><th>Build / Version</th><th>Region</th><th>Package Type</th><th>Size</th><th>Release Date</th><th>Signing / Status</th><th class="actions-col">Action</th></tr></thead><tbody>${state.firmware.map((f,i)=>`<tr><td><div class="file-cell"><span class="file-icon" style="background:linear-gradient(#d4ccb7,#555);">▯</span><div class="file-copy"><strong>${esc(f[0])}</strong><small>${esc(f[1])}</small></div></div></td><td><div class="file-copy"><strong>${esc(f[2])}</strong><small>${esc(f[3])}</small></div></td><td><div class="file-copy"><strong>${esc(f[4])}</strong><small>${esc(f[5])}</small></div></td><td><span class="status-pill ${f[6]==='OTA Update'?'downloading':f[6]==='Flash File'?'queued':'completed'}">${esc(f[6])}</span><div style="margin-top:5px;color:#b8c0ce">${esc(f[7])}</div></td><td>${esc(f[8])}</td><td>${esc(f[9])}</td><td style="color:#16d640">● &nbsp;${esc(f[10])}</td><td class="actions-col"><button class="download-square" data-firmware-download="${i}">⇩</button></td></tr>`).join("")}</tbody></table></section>
  </div>`;
}
function renderOS(){
  return `<div class="page">${pageHead("operating-systems")}
    <div class="os-tabs"><button class="os-tab active">⊞ &nbsp;Windows</button><button class="os-tab">● &nbsp;macOS</button><button class="os-tab">♙ &nbsp;Linux</button></div>
    <div class="os-filters"><label>Version<br><select class="control"><option>All Versions</option></select></label><label>Edition<br><select class="control"><option>All Editions</option></select></label><label>Architecture<br><select class="control"><option>x64</option></select></label><label>Channel<br><select class="control"><option>All Channels</option></select></label><label>Language<br><select class="control"><option>English</option></select></label><button class="btn" style="height:66px;margin-left:auto">Clear filters</button></div>
    <section class="table-panel"><table class="data-table"><thead><tr><th>Version</th><th>Edition</th><th>Architecture</th><th>Channel</th><th>Size</th><th>Build / Release</th><th class="actions-col">Actions</th></tr></thead><tbody>${state.os.map((o,i)=>`<tr><td><div class="file-cell">${fileIcon("windows")}<strong>${esc(o[0])}</strong>${o[1]?`<span class="status-pill completed">${o[1]}</span>`:""}</div></td><td>${esc(o[2])}</td><td>${esc(o[3])}</td><td>${esc(o[4])}</td><td>${esc(o[5])}</td><td>${esc(o[6])}</td><td class="actions-col"><button class="btn small" data-os-download="${i}">Download</button> <button class="btn small">⌄</button></td></tr>`).join("")}</tbody></table><div class="table-footer"><span>Showing 1 to 5 of 28 results</span><div class="pagination"><button class="page-button">‹</button><button class="page-button active">1</button><button class="page-button">2</button><button class="page-button">3</button><button class="page-button">…</button><button class="page-button">6</button><button class="page-button">›</button></div></div></section>
  </div>`;
}
function switchHTML(on=true){return `<span class="toggle ${on?'on':''}" data-toggle></span>`}
function renderSettings(){
  return `<div class="page">${pageHead("settings")}
    <div class="settings-grid">
      <section class="settings-card"><h3>⚙ General</h3>${settingRow("Launch Lumi on system startup",switchHTML(true))}${settingRow("Start minimized to system tray",switchHTML(true))}${settingRow("When closing the window",'<select><option>Minimize to tray</option></select>')}${settingRow("Language",'<select><option>English</option></select>')}${settingRow("Check for updates",'<select><option>Daily</option></select>')}${settingRow("Default download folder",'<input type="text" value="D:\\Downloads">')}</section>
      <section class="settings-card"><h3>⇩ Downloads</h3>${settingRow("Default download category",'<select><option>Uncategorized</option></select>')}${settingRow("Default download queue",'<select><option>Default Queue</option></select>')}${settingRow("Max concurrent downloads",'<input type="number" value="3">')}${settingRow("Max connections per download",'<input type="number" value="16">')}${settingRow("If file exists",'<select><option>Ask what to do</option></select>')}<label class="setting-row full"><span><input type="checkbox" checked> Automatically start downloads</span></label><label class="setting-row full"><span><input type="checkbox"> Add downloads to top of queue</span></label><label class="setting-row full"><span><input type="checkbox" checked> Enable smart file name ⓘ</span></label></section>
      <section class="settings-card"><h3 style="color:#00a7ff">⌁ Network</h3><div style="font-size:13px;margin-bottom:8px">Connection type</div><label class="setting-row full"><span><input type="radio" name="connection" checked> Auto-detect (Recommended)</span></label><label class="setting-row full"><span><input type="radio" name="connection"> Direct connection</span></label><label class="setting-row full"><span><input type="radio" name="connection"> Manual proxy</span></label><hr style="border:0;border-top:1px solid rgba(108,126,160,.2)">${settingRow("Global download speed limit",switchHTML(true))}${settingRow("Maximum download speed",'<input type="number" value="0">')}${settingRow("Maximum upload speed",'<input type="number" value="0">')}${settingRow("Rate limit mode",'<select><option>Per download</option></select>')}<button class="btn" data-test-network style="margin:10px auto 0;display:flex">▥ &nbsp;Test Network</button></section>
      <section class="settings-card"><h3>♧ Notifications</h3>${settingRow("Show desktop notifications",switchHTML(true))}${settingRow("Play sound on download complete",switchHTML(true))}${settingRow("Notify on download errors",switchHTML(true))}${settingRow("Notify on queue completion",switchHTML(false))}<hr style="border:0;border-top:1px solid rgba(108,126,160,.2)">${settingRow("Sound",'<select><option>Chime</option></select>')}${settingRow("Notification timeout",'<select><option>5 seconds</option></select>')}</section>
      <section class="settings-card"><h3>◉ Appearance</h3>${settingRow("Theme",`<select id="theme-select"><option value="dark" ${state.theme==='dark'?'selected':''}>Lumi Dark (Default)</option><option value="light" ${state.theme==='light'?'selected':''}>Lumi Light Glass</option></select>`)}<div class="setting-row"><span>Accent color</span><div class="color-dots"><i class="active" style="background:#9122ff"></i><i style="background:#147cff"></i><i style="background:#00b7d7"></i><i style="background:#00c94f"></i><i style="background:#ff7c0d"></i><i style="background:#f33b74"></i><i style="background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red)"></i></div></div>${settingRow("UI density",'<select><option>Comfortable</option></select>')}${settingRow("Use system title bar",switchHTML(true))}${settingRow("Acrylic / Transparency",'<select><option>Medium</option></select>')}</section>
      <section class="settings-card"><h3>✚ Integrations</h3>${settingRow("Browser extension",'<span style="color:#18d247">Installed &nbsp;&nbsp;<button class="btn small" data-control-jump="browser-extension">Manage</button></span>')}${settingRow("Clipboard monitoring",switchHTML(true))}${settingRow("Capture downloads from browsers",switchHTML(true))}${settingRow("Internet download capture",switchHTML(true))}<hr style="border:0;border-top:1px solid rgba(108,126,160,.2)">${settingRow("Export settings",'<button class="btn small" data-export-settings>Export</button>')}${settingRow("Import settings",'<button class="btn small" data-import-settings>Import</button>')}${settingRow("Reset settings",'<button class="btn small danger" data-reset-settings>Reset</button>')}</section>
    </div>
    <div class="setting-bottom"><button class="btn ghost" data-restore-defaults>↻ &nbsp;Restore Defaults</button><div><button class="btn" data-view-jump="overview">Cancel</button> <button class="btn primary" data-save-settings>Save Changes</button></div></div>
  </div>`;
}
function settingRow(label,control){return `<div class="setting-row"><span>${label}</span>${control}</div>`}
function renderBrowserExtension(){
  return `<div class="page">${pageHead("browser-extension",'<div style="font-size:48px;color:#9c23ff">✚</div>')}
    <section class="panel"><div class="panel-head"><h2>SUPPORTED BROWSERS</h2></div><div class="extension-browser-grid">${browserCard("chrome","Google Chrome","Connected","Version 1.2.0","ID: lmi_chrome_ext")}${browserCard("edge","Microsoft Edge","Installed","Version 1.2.0","ID: lmi_edge_ext")}${browserCard("firefox","Mozilla Firefox","Not Installed","Version 1.2.0","ID: lmi_firefox_ext")}</div></section>
    <div class="extension-bottom"><section class="panel feature-list"><h2>EXTENSION FEATURES</h2>${featureRow("⇩","Capture downloads from browser","Intercept download links and send them to Lumi.")}${featureRow("▣","Monitor clipboard links","Detect links you copy and offer to send to LinkGrabber.")}${featureRow("↗","Send links to LinkGrabber","Quickly send links to Lumi LinkGrabber with one click.")}<div style="color:#9da7b8;margin-top:12px">ⓘ &nbsp;You can manage extension permissions from your browser's extensions page.</div></section><section class="panel how-list"><h2>HOW IT WORKS</h2>${howStep(1,"Install the Lumi extension","Add the extension to your browser from the store.")}${howStep(2,"Connect to Lumi","The extension will connect to Lumi automatically.")}${howStep(3,"Enjoy smarter downloads","Capture downloads, monitor links, and send to LinkGrabber.")}<button class="btn" style="width:100%;margin-top:18px">Learn more about Browser Extension&nbsp;&nbsp;↗</button></section></div>
    <div class="panel privacy-bar"><div><strong>Your privacy matters</strong><div style="color:#aeb6c5;margin-top:4px">Lumi Browser Extension does not collect or share your browsing data.</div></div><button class="btn ghost">View Privacy Policy&nbsp;&nbsp;↗</button></div>
  </div>`;
}
function browserCard(type,name,status,version,id){const icon=type==='chrome'?'C':type==='edge'?'e':'F';const actions=status==='Not Installed'?'<button class="btn primary" data-install-extension="firefox">Install</button><button class="btn">Open Store ↗</button>':'<button class="btn" data-open-extension="'+type+'">Open Extension ↗</button><button class="btn" data-disconnect-extension="'+type+'">Disconnect</button>';return `<article class="browser-card"><div class="browser-top"><div class="browser-logo ${type}">${icon}</div><div class="browser-copy"><h3>${name}</h3><span class="status-pill ${status==='Connected'?'completed':status==='Installed'?'downloading':''}">${status}</span><p>${version}</p><p>${id}</p></div></div><div class="browser-actions">${actions}</div></article>`}
function featureRow(icon,title,sub){return `<div class="feature-row"><div class="feature-icon">${icon}</div><div class="feature-copy"><strong>${title}</strong><small>${sub}</small></div>${switchHTML(true)}</div>`}
function howStep(n,title,sub){return `<div class="how-step"><div class="step-circle">${n}</div><div><strong>${title}</strong><div style="color:#aeb6c5;margin-top:5px">${sub}</div></div></div>`}
function renderHelp(){
  return `<div class="page">${pageHead("help")}<label class="search-control" style="height:58px"><span style="font-size:30px">⌕</span><input style="font-size:16px;flex:1" placeholder="Search help articles..."></label><div class="help-layout"><div><section class="panel faq-panel"><div style="display:flex;justify-content:space-between"><h2>Frequently Asked Questions</h2><button class="btn ghost">View all FAQs</button></div>${["How do I increase download speed?","How do I resume a failed download?","Where are my downloaded files saved?","How do I create and manage queues?","How do I add a new download link?"].map((q,i)=>`<div class="faq-row"><span>${q}</span><button class="btn ghost" data-faq="${i}">⌄</button></div>`).join("")}</section><section class="panel faq-panel" style="margin-top:14px"><h2>Contact & Support</h2><div class="support-grid"><article class="support-card"><div style="font-size:34px;color:#a32cff">♧</div><h3>Help Center</h3><p>Browse guides and troubleshooting articles.</p><button class="btn" data-help-center>Open Help Center</button></article><article class="support-card"><div style="font-size:34px;color:#00a3ff">✉</div><h3>Email Support</h3><p>Get help from our support team.</p><button class="btn" data-email-support>Email Us</button></article><article class="support-card"><div style="font-size:34px;color:#16d54c">▣</div><h3>Community</h3><p>Join discussions and get help from users.</p><button class="btn" data-community>Visit Community</button></article></div><div style="margin-top:14px;color:#aab2c2">ⓘ &nbsp;Tip: Include as much detail as possible when reporting a bug for faster resolution.</div></section></div><section class="panel bug-panel"><h2>Report a Bug</h2><p style="color:#aeb6c5">Help us improve Lumi by reporting issues you encounter.</p><div class="field"><label>Issue title *</label><input id="bug-title" placeholder="Briefly describe the issue"></div><div class="field"><label>Category *</label><select id="bug-category"><option>Select a category</option><option>Downloads</option><option>Interface</option><option>Firmware</option></select></div><div class="field"><label>Description *</label><textarea id="bug-description" placeholder="Describe what happened, what you expected to happen, and any steps to reproduce the issue."></textarea></div><div class="field"><label>Attach log (optional)</label><div class="upload-zone" data-upload-log>☁ &nbsp;<span>Click to upload or drag and drop<br><small>Log files (.log, .zip, .txt) up to 10 MB</small></span></div></div><button class="btn primary" style="width:100%;height:50px" data-submit-bug>Submit Report&nbsp;&nbsp;➤</button></section></div></div>`;
}
function renderAbout(){
  return `<div class="page"><section class="panel about-panel"><h2>ⓘ &nbsp;About Lumi</h2><div class="about-center"><img class="about-logo" src="lumi-approved-brand.svg" alt="Lumi"><h3>Smart. Fast. Reliable.</h3><p>Lumi Download Manager is your all-in-one solution for faster downloads,<br>smarter management, and complete control.</p><div class="about-table"><div class="about-row"><span>◇ &nbsp;Version</span><b>1.0.0</b></div><div class="about-row"><span>⌁ &nbsp;Build</span><b>2025.05.20.174</b></div><div class="about-row"><span>▣ &nbsp;Publisher</span><b>THETECHGUY DIGITAL SOLUTIONS</b></div><div class="about-row"><span>◎ &nbsp;Website</span><b style="color:#a52cff">https://thetechguy.digital</b></div></div><p>© 2025 THETECHGUY DIGITAL SOLUTIONS. All rights reserved.</p><p>Thank you for choosing <span style="color:#a62cff">Lumi</span> Download Manager.</p><div class="about-buttons"><button class="btn" data-website>Website&nbsp;&nbsp;↗</button><button class="btn" data-licenses>Licenses&nbsp;&nbsp;▤</button><button class="btn primary" data-view-jump="overview">× &nbsp;Close</button></div></div></section></div>`;
}

function openNewDownload(prefill=""){
  showModal(`${modalHeader("New Download")}<div class="modal-body"><div class="field"><label>Download URL</label><input id="new-url" value="${esc(prefill)}" placeholder="https://example.com/file.iso"></div><div class="form-row"><div class="field"><label>Category</label><select id="new-category"><option>Operating Systems</option><option>Utilities</option><option>Software</option><option>Mobile Firmware</option></select></div><div class="field"><label>Queue</label><select><option>Default Queue</option><option>High Priority</option></select></div></div><div class="field"><label>Save to</label><input value="D:\\Downloads"></div><div class="modal-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-confirm-download>Add Download</button></div></div>`);
}
function openUpdateDialog(){
  showModal(`${modalHeader("↻  Check for updates")}<div class="modal-body"><div class="setting-row"><span>Current version:</span><b>1.2.0</b></div><div class="setting-row"><span>Latest version:</span><b>1.2.1 &nbsp;<span class="status-pill completed">NEW</span></b></div><div class="setting-row"><span>Update status:</span><b style="color:#14d640">Update available</b></div><div class="setting-row"><span>Last checked:</span><b>May 24, 2025 &nbsp;10:36 PM</b></div><hr style="border:0;border-top:1px solid rgba(110,128,163,.25)"><h3>What's new in 1.2.1</h3><ul style="line-height:1.8;color:#cbd0db"><li>Improved download connection stability</li><li>Added verification for downloaded files</li><li>Enhanced queue management experience</li><li>Fixed minor bugs and performance issues</li></ul><div class="modal-actions"><button class="btn primary" data-download-update>⇩ &nbsp;Download update</button><button class="btn" data-skip-update>Skip this version</button><button class="btn" data-close-modal>Close</button></div></div>`);
}
function openSpeedTest(){
  const panel=$("#floating-panel"); panel.hidden=false; panel.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center"><h2>Speed Test</h2><button class="modal-close" data-close-floating>×</button></div><div class="speed-test-row"><span>Status</span><b id="speed-status">● &nbsp;${state.speedTestRunning?'Testing':'Idle'}</b></div><div class="speed-test-row"><span>Download Speed</span><b id="speed-download">${state.speedTestRunning?'Testing…':'— — —'} &nbsp;Mbps</b></div><div class="speed-test-row"><span>Upload Speed</span><b id="speed-upload">${state.speedTestRunning?'Testing…':'— — —'} &nbsp;Mbps</b></div><div class="speed-test-row"><span>Ping</span><b id="speed-ping">${state.speedTestRunning?'Testing…':'— — —'} &nbsp;ms</b></div><button class="btn primary" style="width:100%;margin-top:10px" data-start-speed-test>${state.speedTestRunning?'Stop Test':'▷ &nbsp;Start Test'}</button>`;
}
function openQueueRules(){showModal(`${modalHeader("Queue Rules")}<div class="modal-body">${settingRow("Max simultaneous downloads",'<input type="number" value="3">')}${settingRow("Start next queue automatically",switchHTML(true))}${settingRow("Stop queue on completion",switchHTML(false))}${settingRow("Respect download limits",switchHTML(true))}<div class="modal-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-save-queue-rules>Save Rules</button></div></div>`)}
function editCategory(index){const c=state.categories[index];showModal(`${modalHeader("Edit Category")}<div class="modal-body"><div class="field"><label>Name</label><input value="${esc(c[0])}"></div><div class="field"><label>File extensions</label><input value="${esc(c[6])}"></div><div class="field"><label>Default location</label><input value="${esc(c[3])}"></div><div class="modal-actions"><button class="btn" data-close-modal>Cancel</button><button class="btn primary" data-save-category>Save Category</button></div></div>`)}

function isPreviewRuntime(){if(window.LumiProductionIntegration?.previewRuntime)return window.LumiProductionIntegration.previewRuntime();return location.protocol==="file:"||location.protocol==="about:"||window.__LUMI_REPLICA_PREVIEW__===true}
function productionHeaders(body=false){
  const headers={"X-Lumi-Client":"web-ui-v4"};
  const token=sessionStorage.getItem("LUMI.bearerToken")||"";
  if(token)headers.Authorization=`Bearer ${token}`;
  if(body)headers["Content-Type"]="application/json";
  return headers;
}
async function productionApi(method,path,body=null){
  const token=sessionStorage.getItem("LUMI.bearerToken")||"";
  const response=await fetch(path,{method,credentials:token?"omit":"same-origin",headers:productionHeaders(body!==null),...(body!==null?{body:JSON.stringify(body)}:{})});
  const text=await response.text();let data={};
  try{data=text?JSON.parse(text):{}}catch(_){data={error:text.slice(0,500)}}
  if(!response.ok)throw new Error(data.error||`${method} ${path} failed (${response.status})`);
  return data;
}
async function establishProductionSession(){
  try{return await productionApi("GET","/api/v4/security/me")}
  catch(_){
    const response=await fetch("/api/security/bootstrap",{credentials:"same-origin",headers:{"X-Lumi-Client":"web-ui-v4"}});
    if(!response.ok)throw new Error("Lumi secure local session is unavailable");
    return response.json();
  }
}
function mapLiveTask(t,i){
  const filename=t.filename||t.url||"Download";
  return {id:t.id||`live-${i}`,name:filename,category:t.category_id||t.type||"Uncategorized",source:t.source||(()=>{try{return new URL(t.url).hostname}catch(_){return "Lumi"}})(),downloaded:Number(t.downloaded_bytes||0)/1073741824,total:Math.max(.001,Number(t.total_bytes||0)/1073741824),progress:Math.round(Number(t.total_bytes)?Number(t.downloaded_bytes||0)/Number(t.total_bytes)*100:0),speed:t.speed_bytes_per_sec?`${(Number(t.speed_bytes_per_sec)/1048576).toFixed(1)} MB/s`:"—",eta:"—",status:t.status||"queued",icon:filename.toLowerCase().includes("windows")?"windows":filename.toLowerCase().includes("ubuntu")?"ubuntu":"zip",priority:t.priority||"Normal",finished:t.finished_at||t.updated_at||"",checksum:t.checksum_status||"Verified",raw:t};
}
async function maybeLoadProductionData(){
  if(window.LumiProductionIntegration?.refreshLive)return window.LumiProductionIntegration.refreshLive({full:true});
  if(isPreviewRuntime())return false;
  try{
    await establishProductionSession();
    const [tasksData,queuesData,categoriesData,settingsData,overviewData]=await Promise.all([
      productionApi("GET","/api/downloads?limit=5000"),
      productionApi("GET","/api/queues"),
      productionApi("GET","/api/categories"),
      productionApi("GET","/api/settings"),
      productionApi("GET","/api/v4/overview"),
    ]);
    if(Array.isArray(tasksData.downloads))state.tasks=tasksData.downloads.map(mapLiveTask);
    if(Array.isArray(categoriesData.categories)&&categoriesData.categories.length){state.categories=categoriesData.categories.map((c,i)=>[c.name||c.id,`${state.tasks.filter(t=>t.category===c.id).length} downloads`,"—",c.folder||"",["⊞","▯","🛠","▤","ZIP","⚙","▣","♫","◇"][i%9],["os","util","image","doc"][i%4],(c.extensions||[]).map(x=>`.${x}`).join(", ")||"*.* (unmatched files)"])}
    state.settings={...state.settings,...settingsData};state.overview=overviewData||{};state.productionReady=true;
    return true;
  }catch(error){console.warn("Lumi approved UI is running with verified preview data:",error.message);return false}
}
async function confirmNewDownload(){
  const url=$("#new-url")?.value.trim();if(!url){toast("Enter a download URL","bad");return}
  const category=$("#new-category")?.value||"Uncategorized";
  if(!isPreviewRuntime()&&state.productionReady){
    try{await productionApi("POST","/api/downloads/start",{url,target_dir:state.settings.default_dir||"",filename:"",queue_id:"default",category_id:category,connections:Number(state.settings.default_connections||16),duplicate_policy:"reuse",overwrite:false,start_paused:false});await maybeLoadProductionData();closeModal();switchView("downloads");toast("Download added to Lumi","good");return}catch(error){toast(error.message,"bad");return}
  }
  state.tasks.unshift({id:`t${Date.now()}`,name:url.split('/').pop()||"New download",category,source:"Added link",downloaded:0,total:1,progress:0,speed:"—",eta:"Queued",status:"queued",icon:"zip",priority:"Normal"});closeModal();switchView("downloads");toast("Download added to Lumi","good");
}

async function callTaskAction(task,action){
  try{
    if(!isPreviewRuntime()&&state.productionReady)await productionApi("POST",`/api/downloads/${encodeURIComponent(task.id)}/${action}`,{});
    if(action==="pause") task.status="paused";
    else if(action==="resume"||action==="retry") task.status="downloading";
    toast(`${task.name}: ${action} applied`,`good`); render();
  }catch(_){toast(`Could not ${action} ${task.name}`,"bad")}
}

function switchView(view){
  if(!meta[view]) return;
  state.view=view; closeTransient(); render();
}
function handleClick(event){
  const nav=event.target.closest("[data-view]"); if(nav){switchView(nav.dataset.view);return}
  if(event.target.closest(".technician-toggle")){const g=$("#technician-group");g.classList.toggle("open");event.target.closest("button").setAttribute("aria-expanded",String(g.classList.contains("open")));return}
  if(event.target.closest("#gear-button")){state.gearOpen=!state.gearOpen;$("#gear-menu").hidden=!state.gearOpen;$("#gear-button").setAttribute("aria-expanded",String(state.gearOpen));return}
  const control=event.target.closest("[data-control]"); if(control){const c=control.dataset.control;closeTransient();if(c==="settings")switchView("settings");else if(c==="speed-test")openSpeedTest();else if(c==="browser-extension")switchView("browser-extension");else if(c==="updates")openUpdateDialog();else if(c==="help")switchView("help");else if(c==="about")switchView("about");return}
  const jump=event.target.closest("[data-view-jump]"); if(jump){switchView(jump.dataset.viewJump);return}
  const cjump=event.target.closest("[data-control-jump]"); if(cjump){switchView(cjump.dataset.controlJump);return}
  if(event.target.closest("[data-open-new]")){openNewDownload();return}
  if(event.target.closest("[data-open-link]")){openNewDownload("https://");return}
  if(event.target.closest("[data-open-folder]")){toast("Opened selected download folder","good");return}
  if(event.target.closest("[data-close-modal]")){closeModal();return}
  if(event.target.closest("[data-close-floating]")){$("#floating-panel").hidden=true;return}
  const taskAction=event.target.closest("[data-task-action]"); if(taskAction){const t=state.tasks.find(x=>x.id===taskAction.dataset.task);if(t)void callTaskAction(t,taskAction.dataset.taskAction);return}
  const status=event.target.closest("[data-status-filter]"); if(status){state.status=status.dataset.status;render();return}
  if(event.target.closest("[data-refresh]")){toast("Downloads refreshed","good");render();return}
  if(event.target.closest("[data-confirm-download]")){void confirmNewDownload();return}
  if(event.target.closest("[data-edit-queue-rules]")){openQueueRules();return}
  if(event.target.closest("[data-save-queue-rules]")){closeModal();toast("Queue rules saved","good");return}
  const move=event.target.closest("[data-queue-move]");if(move){const i=state.queues.findIndex(q=>q.id===move.dataset.queue);const j=move.dataset.queueMove==="up"?i-1:i+1;if(i>=0&&j>=0&&j<state.queues.length){[state.queues[i],state.queues[j]]=[state.queues[j],state.queues[i]];render();toast("Queue order updated","good")}return}
  const qdel=event.target.closest("[data-queue-delete]");if(qdel){state.queues=state.queues.filter(q=>q.id!==qdel.dataset.queueDelete);render();toast("Removed from queue","good");return}
  const qstart=event.target.closest("[data-queue-start]");if(qstart){toast("Queue started","good");return}
  const qpause=event.target.closest("[data-queue-pause]");if(qpause){toast("Queue paused","good");return}
  const cat=event.target.closest("[data-category-edit]");if(cat){editCategory(Number(cat.dataset.categoryEdit));return}
  if(event.target.closest("[data-save-category]")){closeModal();toast("Category updated","good");return}
  const cstar=event.target.closest("[data-category-star]");if(cstar){event.target.textContent=event.target.textContent==="☆"?"★":"☆";toast("Category favorite updated","good");return}
  if(event.target.closest("[data-paste-links]")){navigator.clipboard?.readText().then(t=>toast(t?"Links pasted from clipboard":"Clipboard is empty","good")).catch(()=>toast("Clipboard access is unavailable","bad"));return}
  if(event.target.closest("[data-scan-clipboard]")){toast("Clipboard scanned: 6 packages found","good");return}
  if(event.target.closest("[data-import-file]")){showModal(`${modalHeader("Import Link File")}<div class="modal-body"><div class="upload-zone">Drop a .txt file here</div><div class="modal-actions"><button class="btn" data-close-modal>Close</button></div></div>`);return}
  if(event.target.closest("[data-grab-links]")){toast("Links validated and grouped","good");return}
  const addGrabbed=event.target.closest("[data-add-grabbed]");if(addGrabbed){toast(`${state.links[Number(addGrabbed.dataset.addGrabbed)][0]} added to queue`,`good`);return}
  const delGrabbed=event.target.closest("[data-delete-grabbed]");if(delGrabbed){state.links.splice(Number(delGrabbed.dataset.deleteGrabbed),1);render();toast("Package removed","good");return}
  const toggle=event.target.closest("[data-toggle]");if(toggle){toggle.classList.toggle("on");return}
  const fdownload=event.target.closest("[data-firmware-download]");if(fdownload){const f=state.firmware[Number(fdownload.dataset.firmwareDownload)];state.tasks.unshift({id:`fw${Date.now()}`,name:`${f[0]}_${f[2]}.zip`,category:"Mobile Firmware",source:"Official Firmware",downloaded:0,total:parseFloat(f[8]),progress:0,speed:"—",eta:"Queued",status:"queued",icon:"zip",priority:"High"});toast("Firmware added to downloads","good");switchView("downloads");return}
  const osd=event.target.closest("[data-os-download]");if(osd){const o=state.os[Number(osd.dataset.osDownload)];state.tasks.unshift({id:`os${Date.now()}`,name:`${o[0]} x64 EN-US.iso`,category:"Operating Systems",source:"Official Site",downloaded:0,total:parseFloat(o[5]),progress:0,speed:"—",eta:"Queued",status:"queued",icon:"windows",priority:"Normal"});toast("Operating system added to downloads","good");switchView("downloads");return}
  if(event.target.closest("[data-save-settings]")){const theme=$("#theme-select")?.value||state.theme;state.theme=theme;safeLocal.setItem("lumi.theme",theme);render();toast("Settings saved","good");return}
  if(event.target.closest("[data-restore-defaults]")){state.theme="dark";safeLocal.setItem("lumi.theme","dark");render();toast("Defaults restored","good");return}
  if(event.target.closest("[data-reset-settings]")){state.theme="dark";render();toast("Settings reset","good");return}
  if(event.target.closest("[data-export-settings]")){const blob=new Blob([JSON.stringify({theme:state.theme},null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="lumi-settings.json";a.click();URL.revokeObjectURL(a.href);toast("Settings exported","good");return}
  if(event.target.closest("[data-import-settings]")){toast("Choose a Lumi settings JSON file","good");return}
  if(event.target.closest("[data-test-network]")){openSpeedTest();return}
  if(event.target.closest("[data-start-speed-test]")){runSpeedTest();return}
  if(event.target.closest("[data-install-extension]")){state.extension.firefox="Installed";render();toast("Firefox extension installed","good");return}
  const disc=event.target.closest("[data-disconnect-extension]");if(disc){state.extension[disc.dataset.disconnectExtension]="Not Connected";toast("Browser extension disconnected","good");return}
  if(event.target.closest("[data-open-extension]")){toast("Opened browser extension manager","good");return}
  if(event.target.closest("[data-download-update]")){toast("Update download started","good");closeModal();return}
  if(event.target.closest("[data-skip-update]")){toast("Version 1.2.1 skipped");closeModal();return}
  if(event.target.closest("[data-submit-bug]")){const title=$("#bug-title")?.value.trim(),desc=$("#bug-description")?.value.trim();if(!title||!desc){toast("Issue title and description are required","bad");return}toast("Bug report submitted","good");$("#bug-title").value="";$("#bug-description").value="";return}
  if(event.target.closest("[data-faq]")){toast("FAQ answer expanded","good");return}
  if(event.target.closest("[data-email-support]")){location.href="mailto:support@thetechguyds.com?subject=Lumi%20Support";return}
  if(event.target.closest("[data-help-center]")){toast("Help Center opened","good");return}
  if(event.target.closest("[data-community]")){toast("Community link opened","good");return}
  if(event.target.closest("[data-website]")){toast("Opening thetechguyds.com","good");return}
  if(event.target.closest("[data-licenses]")){showModal(`${modalHeader("Open-source licenses")}<div class="modal-body"><p>Lumi uses Electron, Chromium, Python and selected open-source components. License records are bundled with the release.</p><div class="modal-actions"><button class="btn" data-close-modal>Close</button></div></div>`);return}
  if(!event.target.closest(".gear-wrap")) closeTransient();
}
function runSpeedTest(){
  state.speedTestRunning=true;openSpeedTest();
  let step=0;const timer=setInterval(()=>{step++;$("#speed-status").innerHTML="● &nbsp;Testing";$("#speed-download").textContent=`${Math.min(82.4,15+step*13.2).toFixed(1)} Mbps`;$("#speed-upload").textContent=`${Math.min(18.6,2+step*3.3).toFixed(1)} Mbps`;$("#speed-ping").textContent=`${Math.max(12,44-step*6)} ms`;if(step>=5){clearInterval(timer);state.speedTestRunning=false;$("#speed-status").innerHTML="● &nbsp;Complete";$("#speed-download").textContent="82.4 Mbps";$("#speed-upload").textContent="18.6 Mbps";$("#speed-ping").textContent="12 ms";const b=$("[data-start-speed-test]");if(b)b.textContent="↻  Test Again";toast("Speed test complete","good")}},350);
}

function handleInput(event){
  if(event.target.id==="global-search"){state.search=event.target.value.trim().toLowerCase();if(["downloads","unfinished"].includes(state.view))render()}
  if(event.target.matches("[data-local-search]")){state.search=event.target.value.trim().toLowerCase();render()}
  if(event.target.id==="theme-select"){state.theme=event.target.value;document.body.classList.toggle("light-glass",state.theme==="light")}
}

async function init(){
  document.addEventListener("click",handleClick);
  document.addEventListener("input",handleInput);
  $("#overlay").addEventListener("click",closeModal);
  $("#drive-select").addEventListener("change",e=>{const map={"Drive D:":["248.6 GB","48%"],"Drive C:":["126.9 GB","72%"],"Drive E:":["812.4 GB","19%"]};const [left,pct]=map[e.target.value];$("#storage-left").textContent=left;$("#storage-percent").textContent=pct;toast(`${e.target.value} selected`,`good`)});
  const params=new URLSearchParams(location.search);
  if(params.get("theme")==="light") state.theme="light";
  if(params.get("view")&&meta[params.get("view")]) state.view=params.get("view");
  hydrateStaticIcons();
  await maybeLoadProductionData();
  render();
  if(params.get("gear")==="1"){state.gearOpen=true;$("#gear-menu").hidden=false;$("#gear-button").setAttribute("aria-expanded","true")}
  if(params.get("control")==="speed-test")openSpeedTest();
  if(params.get("control")==="updates")openUpdateDialog();
}

window.LumiReplica={state,render,openSpeedTest,openUpdateDialog,switchView};
document.addEventListener("DOMContentLoaded",init);
