from __future__ import annotations
import json, os, socket, subprocess, sys, time
from pathlib import Path
import requests

def port():
    s=socket.socket();s.bind(("127.0.0.1",0));p=s.getsockname()[1];s.close();return p

def test_same_pc_tool_autopairs_from_owner_only_discovery_file(tmp_path: Path):
    root=Path(__file__).resolve().parents[1]; p=port(); base=f"http://127.0.0.1:{p}"; data=tmp_path/"data"; discovery=tmp_path/"discovery"; log=(tmp_path/"server.log").open("w")
    env=dict(os.environ);env.update({"LUMIDM_DATA_DIR":str(data),"LUMIDM_DISCOVERY_DIR":str(discovery),"LUMIDM_RUNTIME_INSTANCE":"tool-proof","PYTHONUNBUFFERED":"1"})
    proc=subprocess.Popen([sys.executable,"server.py","--host","127.0.0.1","--port",str(p)],cwd=root,env=env,stdout=log,stderr=subprocess.STDOUT)
    try:
        deadline=time.time()+15
        while time.time()<deadline:
            try:
                if requests.get(base+"/",timeout=.8).status_code==200: break
            except requests.RequestException: pass
            time.sleep(.1)
        else: raise AssertionError("server did not start")
        path=discovery/"local-tool.json"; assert path.is_file()
        info=json.loads(path.read_text()); assert info["install_url"]=="https://thetechguyds.com/tools"
        bad=requests.post(base+"/api/security/pair",json={"mode":"local_tool","secret":"wrong","tool_id":"ttg-test"},timeout=5); assert bad.status_code==403
        paired=requests.post(base+"/api/security/pair",json={"mode":"local_tool","secret":info["secret"],"tool_id":"ttg-test","client_name":"TTG Test Tool"},timeout=5)
        assert paired.status_code==200,paired.text
        result=paired.json(); assert result["local"] is True and result["role"]=="owner" and result["device"]["id"].startswith("lumi-")
        state=requests.get(base+"/api/v7/runtime/state",headers={"Authorization":f"Bearer {result['token']}","X-Lumi-Client":"ttg-test"},timeout=5)
        assert state.status_code==200,state.text
        assert state.json()["capabilities"]["same_device_tool_bootstrap"] is True
    finally:
        proc.terminate()
        try: proc.wait(timeout=8)
        except subprocess.TimeoutExpired: proc.kill()
        log.close()
