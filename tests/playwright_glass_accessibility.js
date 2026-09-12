"use strict";
const { chromium } = require("playwright");
function assert(value,message){if(!value)throw new Error(message)}
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:920,height:560}});
 try{
  await page.goto("http://127.0.0.1:7000/",{waitUntil:"domcontentloaded"});
  await page.locator("#app-shell").waitFor({state:"visible"});
  await page.evaluate(()=>{if(typeof switchView==="function")switchView("settings")});
  await page.locator("#approved-settings-form").waitFor({state:"visible"});
  const probe=async theme=>{await page.evaluate(t=>window.LumiTheme.set(t),theme);return page.locator(".approved-settings-card").first().evaluate(el=>{const s=getComputedStyle(el);return{image:s.backgroundImage,backdrop:s.backdropFilter||s.webkitBackdropFilter,color:s.color}})};
  const dark=await probe("dark");
  assert(String(dark.backdrop).includes("blur(12px)"),`Dark surface glass blur missing: ${dark.backdrop}`);
  assert(dark.image.includes("radial-gradient"),`Dark surface reflection missing: ${dark.image}`);
  const darkTextShadow=await page.locator(".approved-settings-card label").first().evaluate(el=>getComputedStyle(el).textShadow);
  assert(darkTextShadow==="none",`Dark functional text has a global shadow: ${darkTextShadow}`);
  const clear=await probe("glass");
  assert(String(clear.backdrop).includes("blur(14px)"),`Light surface glass blur missing: ${clear.backdrop}`);
  assert(clear.image.includes("radial-gradient"),`Light surface reflection missing: ${clear.image}`);
  const select=page.locator('select[name="text_size"]');
  assert(await select.count()===1,"Settings is missing Text size preference");
  const options=await select.locator("option").allTextContents();
  assert(JSON.stringify(options)===JSON.stringify(["Default","Large","Extra Large"]),`Wrong text-size choices: ${JSON.stringify(options)}`);
  const before=await page.locator(".approved-settings-card label").first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  await select.selectOption("large"); await page.waitForTimeout(80);
  const large=await page.locator(".approved-settings-card label").first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  assert(large>before,`Large text did not increase font size: ${before} -> ${large}`);
  assert(await page.evaluate(()=>localStorage.getItem("Lumi.ui.textSize"))==="large","Text size did not persist");
  console.log("LUMI_GLASS_ACCESSIBILITY_PASS",JSON.stringify({dark,clear,before,large,options}));
 } finally {await browser.close()}
})().catch(err=>{console.error("LUMI_GLASS_ACCESSIBILITY_FAIL",err.stack||err);process.exitCode=1});
