"use strict";
(() => {
  const KEY = "Lumi.ui.textSize";
  const DEFAULT = "default";
  const allowed = new Set([DEFAULT, "large", "xlarge"]);
  function read(){ const value=localStorage.getItem(KEY); return allowed.has(value)?value:DEFAULT; }
  function sync(value){
    document.documentElement.dataset.lumiTextSize=value;
    document.querySelectorAll('select[name="text_size"]').forEach(select=>{ if(select.value!==value) select.value=value; });
  }
  function set(value){ const selected=allowed.has(value)?value:DEFAULT; localStorage.setItem(KEY,selected); sync(selected); return selected; }
  sync(read());
  document.addEventListener("change", event => {
    const select=event.target.closest?.('select[name="text_size"]');
    if(select) set(select.value);
  }, true);
  document.addEventListener("reset", event => {
    if(event.target?.id === "approved-settings-form") setTimeout(()=>set(DEFAULT),0);
  }, true);
  window.addEventListener("DOMContentLoaded",()=>{
    sync(read());
    new MutationObserver(()=>sync(read())).observe(document.body,{childList:true,subtree:true});
  },{once:true});
  window.LumiAccessibility=Object.freeze({get:read,set,apply:sync,DEFAULT});
})();
