"use strict";
const { chromium } = require("playwright");
function assert(v,m){if(!v)throw new Error(m)}
function rgbAverage(v){const nums=(String(v).match(/[0-9.]+/g)||[]).slice(0,3).map(Number);return nums.length===3?(nums[0]+nums[1]+nums[2])/3:0}
(async()=>{
 const b=await chromium.launch({headless:true}); const p=await b.newPage({viewport:{width:920,height:560}});
 try{
  await p.goto("http://127.0.0.1:7000/",{waitUntil:"domcontentloaded"}); await p.locator("#app-shell").waitFor({state:"visible"});
  await p.evaluate(()=>{if(typeof switchView==="function")switchView("settings")}); await p.locator("#approved-settings-form").waitFor({state:"visible"});
  for(const theme of ["dark","glass"]){
   await p.evaluate(t=>window.LumiTheme.set(t),theme);
   const proof=await p.evaluate(()=>{const panel=document.querySelector(".approved-settings-card"),input=document.querySelector(".approved-settings-card .input"),label=document.querySelector(".approved-settings-card label");const s=e=>{const c=getComputedStyle(e);return{background:c.backgroundColor,image:c.backgroundImage,border:c.borderColor,boxShadow:c.boxShadow,textShadow:c.textShadow,color:c.color,backdrop:c.backdropFilter||c.webkitBackdropFilter}};return{panel:s(panel),input:s(input),label:s(label)}});
   assert(proof.panel.image.includes("radial-gradient"),`${theme} panel lost glass reflection hierarchy`);
   assert(proof.panel.boxShadow!=="none",`${theme} panel lost restrained depth`);
   assert(proof.label.textShadow!=="none",`${theme} wording lost subtle contrast shadow`);
   assert(theme==="dark"?String(proof.panel.backdrop).includes("blur(12px)"):String(proof.panel.backdrop).includes("blur(14px)"),`${theme} wrong glass blur: ${proof.panel.backdrop}`);
   assert(theme==="dark"?proof.input.background.includes("0.36"):proof.input.background.includes("0.5"),`${theme} control glass mismatch: ${proof.input.background}`);
   if(theme==="dark")assert(rgbAverage(proof.label.color)>=165,`dark muted wording is too dim: ${proof.label.color}`); else assert(rgbAverage(proof.label.color)<=135,`light wording is too washed out: ${proof.label.color}`);
  }
  console.log("LUMI_GLASS_POLISH_PASS");
 } finally {await b.close()}
})().catch(e=>{console.error("LUMI_GLASS_POLISH_FAIL",e.stack||e);process.exitCode=1});
