"use strict";
const { chromium } = require("playwright");
function assert(v,m){if(!v)throw new Error(m)}
(async()=>{
 const b=await chromium.launch({headless:true});
 const p=await b.newPage({viewport:{width:920,height:560}});
 try{
  await p.goto("http://127.0.0.1:7000/",{waitUntil:"domcontentloaded"});
  await p.locator("#app-shell").waitFor({state:"visible"});
  await p.evaluate(()=>{document.body.classList.add("ttg-desktop"); if(typeof switchView==="function")switchView("settings")});
  await p.locator("#approved-settings-form").waitFor({state:"visible"});
  const probe=async theme=>{await p.evaluate(t=>window.LumiTheme.set(t),theme);return p.evaluate(()=>{
    const card=document.querySelector('.approved-settings-card');
    const input=document.querySelector('.approved-settings-card .input');
    const brand=document.querySelector('.brand-background');
    const sidebar=document.querySelector('.sidebar');
    const titlebar=document.querySelector('.ttg-titlebar');
    const cs=e=>getComputedStyle(e);
    const c=cs(card), i=cs(input), bg=cs(brand), s=cs(sidebar), t=titlebar?cs(titlebar):null, frame=getComputedStyle(document.body,'::before');
    return {
      backgroundImage:bg.backgroundImage, backgroundFilter:bg.filter,
      cardImage:c.backgroundImage, cardBackdrop:c.backdropFilter||c.webkitBackdropFilter, cardBorder:c.borderColor, cardShadow:c.boxShadow,
      inputBg:i.backgroundColor, sidebarImage:s.backgroundImage, titlebarBorder:t?t.borderBottomWidth:'absent-browser-shell',
      frameImage:frame.backgroundImage, frameOpacity:frame.opacity
    };
  })};
  const dark=await probe('dark');
  assert(dark.backgroundImage.includes('lumi-background.png'),`Dark exact background missing: ${dark.backgroundImage}`);
  assert(String(dark.cardBackdrop).includes("blur(12px)"),`Dark card blur mismatch: ${dark.cardBackdrop}`);
  assert(dark.cardImage.includes('radial-gradient'),`Dark card has no specular/edge reflection: ${dark.cardImage}`);
  assert(dark.cardShadow!=="none",`Dark card lost controlled depth`);
  if(dark.titlebarBorder!=='absent-browser-shell') assert(dark.titlebarBorder==="0px",`Dark titlebar divider returned: ${dark.titlebarBorder}`);
  assert(dark.frameImage.includes('linear-gradient'),`Dark outer luminous perimeter missing`);
  assert(dark.inputBg.includes('0.36'),`Dark controls lost local glass: ${dark.inputBg}`);
  const light=await probe('glass');
  assert(light.backgroundImage.includes('lumi-background.png'),`Light exact background missing: ${light.backgroundImage}`);
  assert(String(light.cardBackdrop).includes("blur(14px)"),`Light card blur mismatch: ${light.cardBackdrop}`);
  assert(light.cardImage.includes('radial-gradient'),`Light card has no shared glass reflection: ${light.cardImage}`);
  assert(light.cardShadow!=="none",`Light card lost controlled depth`);
  if(light.titlebarBorder!=='absent-browser-shell') assert(light.titlebarBorder==="0px",`Light titlebar divider returned: ${light.titlebarBorder}`);
  assert(light.frameImage.includes('linear-gradient'),`Light outer luminous perimeter missing`);
  assert(light.inputBg.includes('0.5'),`Light controls lost local glass: ${light.inputBg}`);
  console.log('LUMI_REFERENCE_GLASS_PARITY_PASS',JSON.stringify({dark,light}));
 } finally {await b.close()}
})().catch(e=>{console.error('LUMI_REFERENCE_GLASS_PARITY_FAIL',e.stack||e);process.exitCode=1});
