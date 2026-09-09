"use strict";
const { chromium } = require("playwright");
function assert(v,m){if(!v)throw new Error(m)}
(async()=>{
 const b=await chromium.launch({headless:true});
 const p=await b.newPage({viewport:{width:920,height:560}});
 try{
  await p.addInitScript(()=>{Object.defineProperty(window,"electronApp",{configurable:true,value:{isElectron:true,getConnectionCapacity:async()=>({state:"complete",result:{download_mbps:100,upload_mbps:40,latency_ms:6}}),runConnectionCapacityTest:async()=>({state:"complete",result:{download_mbps:100,upload_mbps:40,latency_ms:6}}),getAppInfo:async()=>({version:"source",platform:"win32"}),checkForUpdates:async()=>({available:false,noPublishedRelease:true,message:"No published Lumi release is available yet"}),prepareBrowserExtension:async()=>({ok:true,path:"C:/Lumi Extension"}),openExternal:async()=>({ok:true}),getWindowState:async()=>({maximized:false,focused:true}),windowControl:async()=>({ok:true}),onWindowState:()=>()=>{},onUpdateStatus:()=>()=>{},onConnectionCapacity:()=>()=>{},onServerState:()=>()=>{}}})});
  await p.goto("http://127.0.0.1:7000/",{waitUntil:"domcontentloaded"});
  await p.locator("#app-shell").waitFor({state:"visible"});
  const surfaces=["gear","bell","speed-test","extension","update","help","about"];
  const report={glass:[],dark:[]};
  for(const theme of ["glass","dark"]){
   await p.evaluate(t=>window.LumiTheme.set(t),theme);
   for(const surf of surfaces){
    if(surf==="gear"){await p.click("#ttg-gear");await p.locator("#ttg-gear-menu").waitFor({state:"visible"});}
    else if(surf==="bell"){if(await p.locator("#ttg-gear-menu").isVisible())await p.click("#ttg-gear");await p.click("#ttg-bell");await p.locator("#ttg-notification-menu").waitFor({state:"visible"});}
    else {if(await p.locator("#ttg-notification-menu").isVisible())await p.click("#ttg-bell");await p.evaluate(s=>window.LumiMainUI?.showApprovedControl?.(s),surf);await p.waitForTimeout(60);}
    const bad=await p.evaluate(({theme,surf})=>{
      const root=surf==="gear"?document.querySelector("#ttg-gear-menu"):surf==="bell"?document.querySelector("#ttg-notification-menu"):document.querySelector("#approved-control-overlay:not([hidden]),#view-control.active");
      if(!root)return [{text:"NO ROOT",color:"",l:0}];
      const out=[];
      for(const e of root.querySelectorAll("*")){
       const r=e.getBoundingClientRect(),c=getComputedStyle(e);if(r.width<1||r.height<1||c.display==="none"||c.visibility==="hidden")continue;
       let direct="";for(const n of e.childNodes)if(n.nodeType===3)direct+=n.textContent;direct=direct.trim();if(!direct)continue;
       if(e.closest(".approved-btn.primary,.approved-status,.approved-ready,.approved-theme-segment button.active,.ttg-theme-segment button.active"))continue;
       const nums=(c.color.match(/[0-9.]+/g)||[]).slice(0,3).map(Number);if(nums.length<3)continue;
       const f=x=>{x/=255;return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4)};const L=.2126*f(nums[0])+.7152*f(nums[1])+.0722*f(nums[2]);
       if((theme==="glass"&&L>.72)||(theme==="dark"&&L<.18))out.push({tag:e.tagName,cls:String(e.className||""),text:direct.slice(0,44),color:c.color,l:+L.toFixed(2)});
      }
      return out;
    },{theme,surf});
    if(bad.length)report[theme].push({surf,bad:bad.slice(0,10)});
    if(surf==="gear"&&await p.locator("#ttg-gear-menu").isVisible())await p.click("#ttg-gear");
    if(surf==="bell"&&await p.locator("#ttg-notification-menu").isVisible())await p.click("#ttg-bell");
   }
  }
  assert(report.glass.length===0,`Clear control surfaces have light-on-light copy: ${JSON.stringify(report.glass)}`);
  assert(report.dark.length===0,`Dark control surfaces have dark-on-dark copy: ${JSON.stringify(report.dark)}`);
  console.log("LUMI_THEME_CONTROLS_PALETTE_PASS",JSON.stringify(report));
 }finally{await b.close()}
})().catch(e=>{console.error("LUMI_THEME_CONTROLS_PALETTE_FAIL",e.stack||e);process.exitCode=1});
