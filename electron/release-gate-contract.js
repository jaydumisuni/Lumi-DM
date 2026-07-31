"use strict";
const { app, BrowserWindow, ipcMain, screen, shell } = require("electron");
const fs = require("fs");
const path = require("path");

const LOGIN_ARGS = ["--hidden", "--login-startup"];
function desktopPath(){return path.join(app.getPath("userData"),"LUMIDM-desktop.json");}
function readDesktop(){try{return JSON.parse(fs.readFileSync(desktopPath(),"utf8"));}catch(_){return{};}}
function writeDesktop(value){const next={...readDesktop(),...(value||{})};fs.mkdirSync(path.dirname(desktopPath()),{recursive:true});const temp=`${desktopPath()}.tmp`;fs.writeFileSync(temp,JSON.stringify(next,null,2));fs.renameSync(temp,desktopPath());return next;}
function getStartup(){if(process.platform==="win32"){const value=app.getLoginItemSettings({path:process.execPath,args:LOGIN_ARGS});return Boolean(value.openAtLogin&&value.enabled!==false);}return Boolean(app.getLoginItemSettings().openAtLogin);}
function setStartup(enabled){if(process.platform==="win32")app.setLoginItemSettings({path:process.execPath,args:LOGIN_ARGS,openAtLogin:Boolean(enabled)});else app.setLoginItemSettings({openAtLogin:Boolean(enabled),openAsHidden:true,args:["--hidden"]});}
function displays(){const primary=screen.getPrimaryDisplay();return screen.getAllDisplays().map((display,index)=>({id:String(display.id),label:`${display.id===primary.id?"Primary":`Display ${index+1}`} · ${display.workArea.width}×${display.workArea.height}`}));}
function extensionSource(){return app.isPackaged?path.join(process.resourcesPath,"static","browser-extension","chromium"):path.resolve(__dirname,"..","static","browser-extension","chromium");}

app.whenReady().then(()=>{
  for(const name of ["ttg-open-path","ttg-open-external","ttg-prepare-browser-extension","v5-desktop-settings-get","v5-desktop-settings-save"])try{ipcMain.removeHandler(name);}catch(_){}
  ipcMain.handle("ttg-open-path",async(_event,value)=>{const target=path.resolve(String(value||""));if(!fs.existsSync(target))throw new Error("The selected Lumi path does not exist");const error=await shell.openPath(target);if(error)throw new Error(error);return{ok:true,path:target};});
  ipcMain.handle("ttg-open-external",async(_event,value)=>{const target=String(value||"").trim();if(!/^(https?:|mailto:)/i.test(target))throw new Error("Unsupported external address");await shell.openExternal(target);return{ok:true};});
  ipcMain.handle("ttg-prepare-browser-extension",async()=>{const source=extensionSource();if(!fs.existsSync(path.join(source,"manifest.json")))throw new Error("The Lumi Chromium extension package is missing from this build");const destination=path.join(app.getPath("documents"),"Lumi DM Browser Extension");fs.rmSync(destination,{recursive:true,force:true});fs.cpSync(source,destination,{recursive:true});const error=await shell.openPath(destination);if(error)throw new Error(error);return{ok:true,path:destination,browsers:["chrome","edge"]};});
  ipcMain.handle("v5-desktop-settings-get",()=>({...readDesktop(),startAtLogin:getStartup(),displays:displays()}));
  ipcMain.handle("v5-desktop-settings-save",(_event,value)=>{if(value&&Object.prototype.hasOwnProperty.call(value,"startAtLogin"))setStartup(value.startAtLogin);const{startAtLogin:_ignored,...desktop}=value||{};const next=writeDesktop(desktop);for(const window of BrowserWindow.getAllWindows())if(!window.isDestroyed())window.webContents.send("v5-settings-changed",next);return{...next,startAtLogin:getStartup(),displays:displays()};});
});
