from __future__ import annotations

import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time

import requests


def free_port():
    sock=socket.socket(); sock.bind(("127.0.0.1",0)); port=sock.getsockname()[1]; sock.close(); return port


def wait(base):
    deadline=time.time()+20
    while time.time()<deadline:
        try:
            r=requests.get(base+"/",timeout=1)
            if r.status_code==200: return
        except requests.RequestException: pass
        time.sleep(.15)
    raise AssertionError(base+" did not start")


def owner_session(base):
    session=requests.Session(); r=session.get(base+"/api/security/bootstrap",timeout=5); assert r.status_code==200,r.text; return session


def test_two_lumi_runtimes_pair_and_route_download_to_selected_device(tmp_path: Path):
    root=Path(__file__).resolve().parents[1]
    source_port,target_port=free_port(),free_port()
    source_base=f"http://127.0.0.1:{source_port}"; target_base=f"http://127.0.0.1:{target_port}"
    processes=[]; logs=[]
    try:
        for label,port in (("source",source_port),("target",target_port)):
            data=tmp_path/label; discovery=tmp_path/(label+"-discovery"); log=(tmp_path/(label+".log")).open("w",encoding="utf-8"); logs.append(log)
            env=dict(os.environ); env.update({"LUMIDM_DATA_DIR":str(data),"LUMIDM_DOWNLOAD_DIR":str(data/"downloads"),"LUMIDM_TEMP_DIR":str(data/"tmp"),"LUMIDM_DISCOVERY_DIR":str(discovery),"LUMIDM_RUNTIME_INSTANCE":label,"PYTHONUNBUFFERED":"1"})
            processes.append(subprocess.Popen([sys.executable,"server.py","--host","0.0.0.0","--port",str(port)],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT))
        wait(source_base); wait(target_base)
        source=owner_session(source_base); target=owner_session(target_base)
        target_state=target.get(target_base+"/api/v7/runtime/state",timeout=5).json(); target_id=target_state["device"]["id"]
        issued=target.post(target_base+"/api/v7/devices/pairing",json={"client_name":"Source Lumi","role":"owner"},headers={"Origin":target_base},timeout=5)
        assert issued.status_code==200,issued.text
        bundle=issued.json(); assert bundle["pairing_key"].startswith("LUMI1.") and bundle["endpoints"]
        paired=source.post(source_base+"/api/v7/devices/pair",json={"pairing_key":bundle["pairing_key"]},headers={"Origin":source_base},timeout=15)
        assert paired.status_code==200,paired.text
        assert paired.json()["paired"]["id"]==target_id
        destinations=source.get(source_base+"/api/v7/devices",timeout=5).json()["targets"]
        assert [item["id"] for item in destinations]==[target_id]
        routed=source.post(source_base+"/api/v7/rpc",json={"method":"download.request","params":{"source":"https://example.invalid/paired-device-proof.bin","filename":"paired-device-proof.bin","destination_device":target_id,"start_paused":True,"connections":1}},headers={"Origin":source_base},timeout=15)
        assert routed.status_code==200,routed.text
        body=routed.json(); assert body["ok"] is True and body["result"]["routed"] is True
        task_id=body["result"]["result"]["id"]
        source_state=source.get(source_base+"/api/v7/runtime/state",timeout=5).json()
        target_state=target.get(target_base+"/api/v7/runtime/state",timeout=5).json()
        assert all(task["id"]!=task_id for task in source_state["tasks"])
        remote=next(task for task in target_state["tasks"] if task["id"]==task_id)
        assert remote["filename"]=="paired-device-proof.bin" and remote["status"]=="paused" and remote["connections"]==32
        inbound=target.get(target_base+"/api/v4/security/clients",timeout=5).json()["clients"]
        assert any(item.get("device_id")==source.get(source_base+"/api/v7/runtime/state",timeout=5).json()["device"]["id"] for item in inbound)
    finally:
        for p in processes:
            p.terminate()
        for p in processes:
            try: p.wait(timeout=8)
            except subprocess.TimeoutExpired: p.kill()
        for log in logs: log.close()
