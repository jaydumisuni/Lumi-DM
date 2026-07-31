"use strict";
const fs=require("fs");
const path=require("path");
const vm=require("vm");
const zlib=require("zlib");
const assert=require("assert");

const repo=path.resolve(__dirname,"..");
const electronDir=path.join(repo,"electron");
const payload=["main-payload-01.js","main-payload-02a.js","main-payload-02b.js","main-payload-02c.js","main-payload-02d.js"].map(name=>require(path.join(electronDir,name))).join("");
const source=zlib.gunzipSync(Buffer.from(payload,"base64")).toString("utf8");

function runScenario(argv){
  const windows=[];let readyHandler=null;let trayInstance=null;let menuTemplate=null;let supervisorStarts=0;let supervisorStops=0;let beforeQuitHandler=null;
  class Emitter{constructor(){this.handlers=new Map();}on(name,cb){const values=this.handlers.get(name)||[];values.push(cb);this.handlers.set(name,values);return this;}once(name,cb){const wrap=(...args)=>{this.removeListener(name,wrap);cb(...args);};return this.on(name,wrap);}emit(name,...args){for(const cb of [...(this.handlers.get(name)||[])])cb(...args);}removeListener(name,cb){this.handlers.set(name,(this.handlers.get(name)||[]).filter(value=>value!==cb));}}
  class WebContents extends Emitter{constructor(owner){super();this.owner=owner;this.id=100+windows.length;this.sent=[];}setWindowOpenHandler(handler){this.openHandler=handler;}send(...args){this.sent.push(args);}}
  class BrowserWindow extends Emitter{
    constructor(options){super();this.options=options;this.visible=false;this.destroyed=false;this.minimized=false;this.maximized=false;this.focused=false;this.webContents=new WebContents(this);windows.push(this);}
    static fromWebContents(contents){return windows.find(window=>window.webContents===contents)||null;}static getFocusedWindow(){return windows.find(window=>window.focused)||null;}static getAllWindows(){return windows.filter(window=>!window.destroyed);}
    isDestroyed(){return this.destroyed;}isVisible(){return this.visible;}show(){this.visible=true;this.emit("show");}showInactive(){this.visible=true;}hide(){this.visible=false;}focus(){this.focused=true;this.emit("focus");}isFocused(){return this.focused;}minimize(){this.minimized=true;this.visible=false;}isMinimized(){return this.minimized;}restore(){this.minimized=false;this.visible=true;}maximize(){this.maximized=true;this.emit("maximize");}unmaximize(){this.maximized=false;this.emit("unmaximize");}isMaximized(){return this.maximized;}
    close(){const event={prevented:false,preventDefault(){this.prevented=true;}};this.emit("close",event);if(!event.prevented){this.destroyed=true;this.emit("closed");}}destroy(){this.destroyed=true;this.visible=false;this.emit("closed");}setMenuBarVisibility(){}setProgressBar(value){this.progress=value;}setBounds(value){this.bounds=value;}setSkipTaskbar(value){this.skipTaskbar=value;}setAlwaysOnTop(){}setVisibleOnAllWorkspaces(){}setFocusable(value){this.focusable=value;}loadURL(value){this.loaded={type:"url",value};return Promise.resolve();}loadFile(value){this.loaded={type:"file",value};return Promise.resolve();}
  }
  class Tray extends Emitter{constructor(image){super();this.image=image;trayInstance=this;}setToolTip(value){this.tooltip=value;}setContextMenu(value){this.menu=value;}}
  const ipcHandlers=new Map();const ipcEvents=new Map();
  const app={isPackaged:false,setName(value){this.name=value;},setAppUserModelId(value){this.appId=value;},requestSingleInstanceLock(){return true;},quit(){this.quitCalled=true;},whenReady(){return{then(callback){readyHandler=callback;}};},on(name,callback){if(name==="before-quit")beforeQuitHandler=callback;},getPath(name){return path.join(repo,".test-data",name);},getLoginItemSettings(){return{openAtLogin:false,enabled:true,wasOpenedAtLogin:false,wasOpenedAsHidden:false};},setLoginItemSettings(){},getName(){return this.name||"Lumi DM";},getVersion(){return"1.0.0";}};
  const electron={app,BrowserWindow,Menu:{setApplicationMenu(){},buildFromTemplate(template){menuTemplate=template;return template;}},Tray,Notification:class extends Emitter{static isSupported(){return true;}show(){}},dialog:{showOpenDialog:async()=>({canceled:true,filePaths:[]})},ipcMain:{handle(name,callback){ipcHandlers.set(name,callback);},on(name,callback){ipcEvents.set(name,callback);}},nativeImage:{createFromPath(value){return{path:value,isEmpty(){return false;}};},createEmpty(){return{};}},screen:{getPrimaryDisplay(){return{id:1,workArea:{x:0,y:0,width:1920,height:1080}};},getAllDisplays(){return[this.getPrimaryDisplay()];}},shell:{openExternal:async()=>{},openPath:async()=>""}};
  const supervisor={checkReady:async()=>true,start(){supervisorStarts++;},stop(){supervisorStops++;}};
  class UpdateManager{constructor(options){this.options=options;}async check(){return{status:"up-to-date"};}}
  function customRequire(id){if(id==="electron")return electron;if(id==="fs")return fs;if(id==="http")return{request(){throw new Error("HTTP not expected in lifecycle test");}};if(id==="path")return path;if(id.endsWith("server-supervisor"))return supervisor;if(id.endsWith("update-manager"))return{UpdateManager};if(id.endsWith("native-session")||id.endsWith("connection-capacity")||id.endsWith("desktop-command-poller"))return{};throw new Error(`Unexpected require ${id}`);}
  const sandbox={require:customRequire,module:{exports:{}},exports:{},__dirname:electronDir,process:{...process,argv:["node","main.js",...argv],platform:"win32",execPath:"C:/Program Files/THETECHGUY DIGITAL SOLUTIONS/Lumi DM/Lumi.exe",env:{}},console,setTimeout,clearTimeout,setInterval:()=>1,clearInterval};
  vm.runInNewContext(source,sandbox,{filename:path.join(electronDir,"main.runtime.js")});assert(readyHandler,"ready handler registered");readyHandler();
  return new Promise((resolve,reject)=>setImmediate(()=>{try{resolve({windows,trayInstance,menuTemplate,supervisorStarts,beforeQuitHandler,get supervisorStops(){return supervisorStops;},ipcHandlers,ipcEvents});}catch(error){reject(error);}}));
}

(async()=>{
  assert(fs.existsSync(path.join(repo,"static","favicon-256.png")),"canonical Lumi icon exists");
  assert(!fs.existsSync(path.join(repo,"assets","windows","Lumi-DM.ico")),"obsolete Windows ICO removed");
  assert(!fs.existsSync(path.join(repo,"Resouces","download manager logo.png")),"obsolete widget logo removed");

  const normal=await runScenario([]);const main=normal.windows[0];
  assert(main&&main.visible,"normal launch shows the full app");assert.strictEqual(normal.windows.length,1,"normal launch creates no widget");assert.strictEqual(main.options.title,"Lumi Download Manager");assert(main.options.icon.endsWith(path.join("static","favicon-256.png")));assert.strictEqual(main.options.skipTaskbar,undefined);
  assert(normal.trayInstance&&normal.trayInstance.image.path.endsWith(path.join("static","favicon-256.png")));assert.strictEqual(normal.trayInstance.handlers.get("click")[0].name,"showMainWindow");
  main.close();assert(!main.destroyed&&!main.visible,"close hides to tray without destroying");assert.strictEqual(normal.windows.length,1,"close does not create widget");
  const showWidget=normal.menuTemplate.find(item=>item.label==="Show download widget");assert(showWidget);showWidget.click();assert.strictEqual(normal.windows.length,2);const widget=normal.windows[1];assert(widget.visible);assert.strictEqual(widget.options.skipTaskbar,true);assert.strictEqual(widget.skipTaskbar,true);assert(widget.options.icon.endsWith(path.join("static","favicon-256.png")));
  normal.trayInstance.emit("click");assert(main.visible);assert(!widget.visible,"opening main hides widget");normal.ipcEvents.get("v5-widget-show")();assert(!widget.visible,"widget cannot cover open main");main.close();assert(!main.visible&&!widget.visible);
  normal.beforeQuitHandler();assert.strictEqual(normal.supervisorStarts,1);assert.strictEqual(normal.supervisorStops,1);

  const hidden=await runScenario(["--hidden","--login-startup"]);const hiddenMain=hidden.windows[0];assert(hiddenMain&&!hiddenMain.visible);assert.strictEqual(hidden.windows.length,1);assert(hidden.trayInstance);hidden.trayInstance.emit("click");assert(hiddenMain.visible);assert.strictEqual(hidden.windows.length,1);hiddenMain.close();assert(!hiddenMain.visible);assert.strictEqual(hidden.windows.length,1);

  console.log("Lumi Windows lifecycle contract: 32/32 PASS");
})().catch(error=>{console.error(error);process.exit(1);});
