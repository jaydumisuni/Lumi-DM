"""Real API/engine release-gate proof for Lumi DM."""
from __future__ import annotations
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib, os
from pathlib import Path
import sys, threading, time
import pytest

REPO_ROOT=Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0,str(REPO_ROOT))

SIZE=32*1024*1024
DATA=bytes(range(256))*(SIZE//256)
SHA=hashlib.sha256(DATA).hexdigest()
CHUNK=64*1024
DELAY=.004

class RangeHandler(BaseHTTPRequestHandler):
    protocol_version="HTTP/1.1"
    def log_message(self,*_args): pass
    def do_GET(self):
        value=self.headers.get("Range","")
        if value.startswith("bytes="):
            start_text,end_text=value[6:].split(",",1)[0].split("-",1)
            start=int(start_text or 0);end=int(end_text) if end_text else SIZE-1
            start=max(0,min(start,SIZE-1));end=max(start,min(end,SIZE-1));body=memoryview(DATA)[start:end+1]
            self.send_response(206);self.send_header("Content-Range",f"bytes {start}-{end}/{SIZE}")
        else:
            body=memoryview(DATA);self.send_response(200)
        self.send_header("Accept-Ranges","bytes");self.send_header("Content-Type","application/octet-stream")
        self.send_header("Content-Disposition",'attachment; filename="release-gate.bin"')
        self.send_header("Content-Length",str(len(body)));self.send_header("ETag",'"lumi-release-gate-v1"');self.end_headers()
        try:
            for offset in range(0,len(body),CHUNK):
                self.wfile.write(body[offset:offset+CHUNK]);self.wfile.flush();time.sleep(DELAY)
        except (BrokenPipeError,ConnectionResetError): pass

@pytest.fixture(scope="module")
def range_url():
    server=ThreadingHTTPServer(("127.0.0.1",0),RangeHandler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    yield f"http://127.0.0.1:{server.server_port}/release-gate.bin"
    server.shutdown();server.server_close();thread.join(timeout=5)

@pytest.fixture(scope="module")
def lumi(tmp_path_factory):
    root=tmp_path_factory.mktemp("lumi-release-gate")
    os.environ.update(LUMIDM_DATA_DIR=str(root/"data"),LUMIDM_DOWNLOAD_DIR=str(root/"downloads"),LUMIDM_TEMP_DIR=str(root/"temporary"))
    for name in list(sys.modules):
        if name=="server" or name.startswith("core."):sys.modules.pop(name,None)
    module=importlib.import_module("server");client=module.app.test_client()
    client.environ_base["HTTP_ORIGIN"]="http://localhost"
    client.environ_base["HTTP_X_LUMI_CLIENT"]="release-gate-test"
    response=client.get("/api/security/bootstrap");assert response.status_code==200,response.get_data(as_text=True)
    return client,root

def poll(client,task_id,timeout=35):
    deadline=time.monotonic()+timeout;last=None
    while time.monotonic()<deadline:
        response=client.get(f"/api/downloads/{task_id}");assert response.status_code==200
        last=response.get_json()
        if last.get("status") in {"completed","failed","cancelled","needs_link"}:return last
        time.sleep(.08)
    pytest.fail(f"task timed out: {last}")

def download(client,url,target,name,connections):
    started=time.monotonic();response=client.post("/api/downloads/start",json={"url":url,"target_dir":str(target),"temp_dir":str(target/".parts"),"filename":name,"connections":connections,"duplicate_policy":"overwrite"})
    assert response.status_code==200,response.get_data(as_text=True);task=response.get_json();assert task["connections"]==connections
    result=poll(client,task["id"]);elapsed=time.monotonic()-started;assert result["status"]=="completed",result
    file=Path(result["final_path"]);assert file.exists();assert hashlib.sha256(file.read_bytes()).hexdigest()==SHA
    return elapsed,result

def test_default_32_and_saved_setting(lumi):
    client,_=lumi;assert client.get("/api/settings").get_json()["default_connections"]==32
    assert client.post("/api/settings/connections",json={"value":12}).status_code==200
    assert client.get("/api/settings").get_json()["default_connections"]==12
    assert client.post("/api/settings/connections",json={"value":32}).status_code==200

def test_real_32_connection_download_is_faster_and_exact(lumi,range_url):
    client,root=lumi;single_seconds,single=download(client,range_url,root/"downloads","single.bin",1);parallel_seconds,parallel=download(client,range_url,root/"downloads","parallel.bin",32)
    assert single["mode"]=="single";assert parallel["mode"]=="adaptive"
    assert parallel_seconds<single_seconds*.72,{"single":single_seconds,"parallel":parallel_seconds}

def test_pause_resume_preserves_integrity(lumi,range_url):
    client,root=lumi;response=client.post("/api/downloads/start",json={"url":range_url,"target_dir":str(root/"downloads"),"temp_dir":str(root/"temporary"),"filename":"resume.bin","connections":8,"duplicate_policy":"overwrite"});assert response.status_code==200;task_id=response.get_json()["id"]
    deadline=time.monotonic()+10;before=0
    while time.monotonic()<deadline:
        task=client.get(f"/api/downloads/{task_id}").get_json();before=int(task.get("downloaded_bytes") or 0)
        if task.get("status")=="running" and before>=512*1024:break
        time.sleep(.05)
    assert before>0;assert client.post(f"/api/downloads/{task_id}/pause",json={}).status_code==200
    deadline=time.monotonic()+10;paused=None
    while time.monotonic()<deadline:
        paused=client.get(f"/api/downloads/{task_id}").get_json()
        if paused.get("status")=="paused":break
        time.sleep(.08)
    assert paused and paused.get("status")=="paused";assert int(paused.get("downloaded_bytes") or 0)>=before
    assert client.post(f"/api/downloads/{task_id}/resume",json={}).status_code==200
    completed=poll(client,task_id);assert completed["status"]=="completed";assert hashlib.sha256(Path(completed["final_path"]).read_bytes()).hexdigest()==SHA
