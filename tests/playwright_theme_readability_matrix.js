"use strict";
const { chromium } = require("playwright");
function assert(v,m){if(!v)throw new Error(m)}
function luminance(color){const n=(String(color).match(/[0-9.]+/g)||[]).slice(0,3).map(Number);if(n.length<3)return 0;const f=x=>{x/=255;return x<=.04045?x/12.92:Math.pow((x+.055)/1.055,2.4)};return .2126*f(n[0])+.7152*f(n[1])+.0722*f(n[2])}
(async()=>{
 const b=await chromium.launch({headless:true});
 const p=await b.newPage({viewport:{width:920,height:560}});
 try{
  await p.goto("http://127.0.0.1:7000/",{waitUntil:"domcontentloaded"});
  await p.locator("#app-shell").waitFor({state:"visible"});
  await p.evaluate(()=>{if(typeof switchView==="function")switchView("settings")});
  await p.locator("#approved-settings-form").waitFor({state:"visible"});
  const report={};
  for(const theme of ["dark","glass"]){
   await p.evaluate(t=>window.LumiTheme.set(t),theme);
   const s=await p.evaluate(()=>{
    const panel=document.querySelector(".approved-settings-card");
    const primary=document.querySelector(".approved-settings-card h3");
    const secondary=document.querySelector(".approved-settings-card label");
    const brand=document.querySelector(".brand-background");
    const read=e=>{const c=getComputedStyle(e);return {color:c.color,textShadow:c.textShadow}};
    const pc=getComputedStyle(panel),bc=getComputedStyle(brand);
    return {panelImage:pc.backgroundImage,panelBackdrop:pc.backdropFilter||pc.webkitBackdropFilter,brandImage:bc.backgroundImage,primary:read(primary),secondary:read(secondary)};
   });
   assert(s.brandImage.includes("lumi-background.png"),`${theme}: owned background is missing`);
   assert(s.panelImage.includes("radial-gradient"),`${theme}: panel lost glass reflection hierarchy`);
   assert(s.primary.textShadow==="none"&&s.secondary.textShadow==="none",`${theme}: functional copy has a global text shadow`);
   const pL=luminance(s.primary.color),sL=luminance(s.secondary.color);
   if(theme==="dark"){
    assert(pL>=0.72,`dark: primary text too dim (${pL.toFixed(3)}) ${s.primary.color}`);
    assert(sL>=0.38,`dark: secondary text too dim (${sL.toFixed(3)}) ${s.secondary.color}`);
    assert(String(s.panelBackdrop).includes("blur(12px)"),`dark: wrong glass blur ${s.panelBackdrop}`);
   }else{
    assert(pL<=0.14,`light: primary text too light (${pL.toFixed(3)}) ${s.primary.color}`);
    assert(sL<=0.42,`light: secondary text too light (${sL.toFixed(3)}) ${s.secondary.color}`);
    assert(String(s.panelBackdrop).includes("blur(14px)"),`light: wrong glass blur ${s.panelBackdrop}`);
   }
   report[theme]={primary:s.primary.color,primaryL:+pL.toFixed(3),secondary:s.secondary.color,secondaryL:+sL.toFixed(3),backdrop:s.panelBackdrop};
  }
  console.log("LUMI_THEME_READABILITY_MATRIX_PASS",JSON.stringify(report));
 }finally{await b.close()}
})().catch(e=>{console.error("LUMI_THEME_READABILITY_MATRIX_FAIL",e.stack||e);process.exitCode=1});
