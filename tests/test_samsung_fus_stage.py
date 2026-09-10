from types import SimpleNamespace
from pathlib import Path

from core.v5 import api
from core.v5.samsung_fus import SamsungResolvedPackage


class FakeStore:
    def __init__(self, task): self.task = task; self.saved = []
    def save_task(self, task): self.saved.append(task)
    def append_event(self, *args): pass

class FakeRuntime:
    def __init__(self, task, data_dir): self.task=task; self.data_dir=data_dir; self.store=FakeStore(task)
    def get_task(self, task_id): return self.task if task_id == self.task.id else None

class FakeService:
    def __init__(self, task, data_dir): self.runtime=FakeRuntime(task,data_dir); self.calls=[]
    def start_http(self, url, **kwargs): self.calls.append((url,kwargs)); return {"id": self.runtime.task.id}


def test_samsung_stage_uses_vaultable_request_envelope_and_marks_postprocess(tmp_path):
    task = SimpleNamespace(id="s1", status="paused", category_id="", metadata={}, total_bytes=0)
    service = FakeService(task,tmp_path)
    resolved = SamsungResolvedPackage(model="SM-S921B",csc="EUX",version="A/B/C/D",filename="fw.zip.enc4",size=1234,url="http://cloud-neofussvr.sslcs.cdngc.net/NF_DownloadBinaryForMass.do?file=/fw.zip.enc4",authorization="FUS nonce=secret",encryption=4,decrypt_key_hex="11"*16)
    result = api._stage_samsung_resolved(service,resolved,target_dir=tmp_path/"downloads",temp_dir=tmp_path/"tmp")
    assert result is task
    url, kwargs = service.calls[0]
    assert kwargs["request_envelope"]["headers"]["Authorization"] == "FUS nonce=secret"
    assert kwargs["request_envelope"]["provider_secret"] == {"samsung_decrypt_key": "11"*16}
    assert kwargs["category_id"] == "firmware" and kwargs["start_paused"] is True
    assert task.status == "staged" and task.total_bytes == 1234
    marker = task.metadata["samsung_fus_decrypt"]
    assert marker == {"model":"SM-S921B","csc":"EUX","version":"A/B/C/D","encryption":4}
    assert "authorization" not in str(task.metadata).lower()
