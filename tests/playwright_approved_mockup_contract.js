"use strict";
const { chromium } = require("playwright");
const BASE = process.env.LUMI_PLAYWRIGHT_BASE || "http://127.0.0.1:7000";
function assert(v,m){if(!v)throw new Error(m)}
async function main(){
 const b=await chromium.launch({headless:true,channel:"chromium"});
 const c=await b.newContext({viewport:{width:920,height:560},deviceScaleFactor:1});
 await c.addInitScript(()=>Object.defineProperty(window,"electronApp",{configurable:true,value:{
  isElectron:true,traceStage0:()=>"approved-mockup-contract",pickFolder:async()=>"C:\\Users\\Lumi\\Downloads",openPath:async()=>({ok:true}),openExternal:async()=>({ok:true}),prepareBrowserExtension:async()=>({ok:true,path:"C:\\Lumi Extension"}),getDesktopSettings:async()=>({corner:"bottom-right",displayId:"primary",margin:12,scale:1,visible:true,showUpload:false,displays:[{id:"primary",label:"Primary"}]}),saveDesktopSettings:async v=>v,showWidget:()=>{},checkForUpdates:async()=>({available:false,currentVersion:"1.0.0",version:"1.0.0",message:"No published Lumi release is available yet."}),getConnectionCapacity:async()=>({state:"complete",result:{download_mbps:100,upload_mbps:50,latency_ms:5,provider:"fixture"}}),runConnectionCapacityTest:async()=>({state:"complete",result:{download_mbps:100,upload_mbps:50,latency_ms:5,provider:"fixture"}}),windowControl:async()=>({ok:true,maximized:false,focused:true}),getWindowState:async()=>({maximized:false,focused:true}),getAppInfo:async()=>({name:"Lumi DM",version:"1.0.0",platform:"win32",architecture:"x64",publisher:"THETECHGUY DIGITAL SOLUTIONS"}),onWindowState:()=>()=>{},onUpdateStatus:()=>()=>{},onConnectionCapacity:()=>()=>{},onServerState:()=>()=>{}
 }}));
 const p=await c.newPage(); await p.goto(BASE,{waitUntil:"domcontentloaded",timeout:30000}); await p.locator("#app-shell").waitFor({state:"visible",timeout:20000}); await p.waitForFunction(()=>window.LumiMainUI);
 const go=async view=>{await p.click(`.nav-item[data-view="${view}"]`); await p.locator(`#view-${view}.active`).waitFor({state:"visible"});};
 await go("downloads"); assert(await p.locator("#view-downloads .approved-summary-grid .approved-stat").count()===4,"All Downloads summary mismatch"); assert(await p.locator("#view-downloads .approved-dense-table").count()===1,"All Downloads table mismatch");
 await go("unfinished"); assert(await p.locator("#view-unfinished .approved-summary-grid .approved-stat").count()===4,"Unfinished summary mismatch");
 await go("finished"); assert(await p.locator("#view-finished .approved-summary-grid .approved-stat").count()===4,"Finished summary mismatch");
 await go("queues"); assert(await p.locator("#view-queues .approved-summary-grid .approved-stat").count()===4,"Queues summary mismatch"); assert(await p.locator("#view-queues .approved-queue-rules").count()===1,"Queue rules mismatch"); assert(await p.locator("#view-queues .approved-dense-table").count()===1,"Queues table mismatch");
 await go("categories"); assert(await p.locator("#view-categories .approved-category-grid").count()===1,"Categories grid mismatch"); assert(await p.locator("#view-categories .approved-category-rules").count()===1,"Category rules mismatch");
 await go("grabber"); assert(await p.locator("#view-grabber .approved-linkgrabber-layout").count()===1,"LinkGrabber layout mismatch"); assert(await p.locator("#view-grabber .approved-link-options").count()===1,"LinkGrabber options mismatch");
 await p.click(".nav-group-toggle"); await p.click('.nav-submenu .nav-item[data-view="firmware"]'); await p.locator("#view-firmware.active").waitFor({state:"visible"}); await p.waitForTimeout(150); assert(await p.locator("#view-firmware .approved-firmware-page").count()===1,"Mobile Firmware page mismatch"); assert(await p.locator("#view-firmware .approved-platform-tabs button").count()===2,"Mobile Firmware platform tabs mismatch"); assert(await p.locator("#view-firmware .approved-firmware-table").count()===1,"Mobile Firmware table mismatch");
 await p.click('.nav-submenu .nav-item[data-view="operating_systems"]'); await p.locator("#view-operating_systems.active").waitFor({state:"visible"}); await p.waitForTimeout(150); assert(await p.locator("#view-operating_systems .approved-os-page").count()===1,"Operating Systems page mismatch"); assert(await p.locator("#view-operating_systems .approved-platform-tabs button").count()===3,"Operating Systems platform tabs mismatch"); assert(await p.locator("#view-operating_systems .approved-os-table").count()===1,"Operating Systems table mismatch");
 await p.click("#ttg-gear"); assert((await p.locator("#ttg-gear-menu > button").count())===6,"Gear six actions lost"); assert(await p.locator("#ttg-gear-menu .lumi-appearance-control").count()===1,"Appearance selector lost"); await p.click("#ttg-gear");
 await p.click("#ttg-bell"); assert(await p.locator("#ttg-notification-menu .lumi-notification-pref").count()===1,"Bell completion preference lost"); await p.click("#ttg-bell");
 await p.click("#ttg-gear"); await p.click('#ttg-gear-menu [data-shell-action="settings"]'); await p.locator('#view-settings.active').waitFor({state:'visible'}); const heads=await p.locator('#view-settings .approved-settings-card h3').allTextContents(); for(const x of ['General','Downloads','Network','Notifications','Appearance','Integrations']) assert(heads.includes(x),`Settings missing ${x}`);
 async function control(sel,expect){await p.click('#ttg-gear'); await p.click(sel); await p.locator(expect).waitFor({state:'visible',timeout:10000});}
 await control('#ttg-gear-menu [data-shell-action="speed-test"]','.approved-speed-drawer'); await p.click('.approved-control-close');
 await control('#ttg-gear-menu [data-main-shell-action="extension"]','#view-control.approved-control-page[data-control="extension"]');
 await control('#ttg-gear-menu [data-shell-action="update"]','.approved-update-panel'); await p.click('.approved-control-close');
 await control('#ttg-gear-menu [data-main-shell-action="help"]','#view-control.approved-control-page[data-control="help"]');
 await control('#ttg-gear-menu [data-main-shell-action="about"]','#view-control.approved-control-page[data-control="about"]');
 console.log('APPROVED_MOCKUP_CONTRACT_PASS'); await b.close();
}
main().catch(e=>{console.error('APPROVED_MOCKUP_CONTRACT_FAIL',e);process.exit(1)});
