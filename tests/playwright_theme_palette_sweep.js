"use strict";
const { chromium } = require("playwright");
function assert(v,m){if(!v)throw new Error(m)}
function luminance(color){const n=(String(color).match(/[0-9.]+/g)||[]).slice(0,3).map(Number);if(n.length<3)return 0;const f=x=>{x/=255;return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4)};return .2126*f(n[0])+.7152*f(n[1])+.0722*f(n[2])}
const VIEWS=["downloads","unfinished","finished","queues","categories","grabber","settings","firmware","operating_systems"];
(async()=>{
 const b=await chromium.launch({headless:true});
 const p=await b.newPage({viewport:{width:920,height:560}});
 try{
  await p.goto("http://127.0.0.1:7000/",{waitUntil:"domcontentloaded"});
  await p.locator("#app-shell").waitFor({state:"visible"});
  const report={glass:[],dark:[]};
  for(const theme of ["glass","dark"]){
   await p.evaluate(t=>window.LumiTheme.set(t),theme);
   for(const view of VIEWS){
    await p.evaluate(v=>{if(typeof switchView==="function")switchView(v)},view);
    await p.waitForTimeout(30);
    const bad=await p.evaluate(({theme})=>{
      const out=[];
      for(const e of document.querySelectorAll('#content .view.active .approved-page *')){
        const r=e.getBoundingClientRect(),c=getComputedStyle(e);
        if(r.width<1||r.height<1||c.display==='none'||c.visibility==='hidden')continue;
        let direct='';for(const n of e.childNodes)if(n.nodeType===3)direct+=n.textContent;direct=direct.trim();if(!direct)continue;
        if(e.closest('.approved-btn.primary,.approved-filter.active,.approved-platform-tabs button.active,.approved-status,.approved-ready,.approved-bad,.approved-verified,.approved-theme-segment button.active'))continue;
        const nums=(c.color.match(/[0-9.]+/g)||[]).slice(0,3).map(Number);if(nums.length<3)continue;
        const f=x=>{x/=255;return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4)};const L=.2126*f(nums[0])+.7152*f(nums[1])+.0722*f(nums[2]);
        if((theme==='glass'&&L>.72)||(theme==='dark'&&L<.18))out.push({tag:e.tagName,cls:String(e.className||''),text:direct.slice(0,44),color:c.color,l:+L.toFixed(2)});
      }
      return out;
    },{theme});
    if(bad.length) report[theme].push({view,bad:bad.slice(0,12)});
   }
  }
  assert(report.glass.length===0,`Clear Glass has leftover light-on-dark colors: ${JSON.stringify(report.glass)}`);
  assert(report.dark.length===0,`Dark Glass has leftover dark-on-light colors: ${JSON.stringify(report.dark)}`);
  console.log("LUMI_THEME_PALETTE_SWEEP_PASS",JSON.stringify(report));
 }finally{await b.close()}
})().catch(e=>{console.error("LUMI_THEME_PALETTE_SWEEP_FAIL",e.stack||e);process.exitCode=1});
