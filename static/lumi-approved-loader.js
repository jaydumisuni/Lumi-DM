"use strict";
(async()=>{
 const encoded=(globalThis.__LUMI_APPROVED_PAYLOAD__||[]).join("");
 delete globalThis.__LUMI_APPROVED_PAYLOAD__;
 const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
 const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
 const payload=JSON.parse(await new Response(stream).text());
 const style=document.createElement("style");style.dataset.lumiApproved="true";style.textContent=payload.css;document.head.appendChild(style);
 (0,eval)(payload.ui+"\n//# sourceURL=lumi-approved-ui.js");
 (0,eval)(payload.integration+"\n//# sourceURL=lumi-approved-integration.js");
 globalThis.__LUMI_APPROVED_READY__=true;
 window.dispatchEvent(new CustomEvent("lumi-approved-ready"));
})().catch(error=>{console.error("Lumi approved UI failed to start",error);document.body.dataset.lumiUiError=String(error&&error.message||error);window.dispatchEvent(new CustomEvent("lumi-approved-error",{detail:{message:String(error&&error.message||error)}}));});
