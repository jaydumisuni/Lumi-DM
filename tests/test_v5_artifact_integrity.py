from types import SimpleNamespace
from pathlib import Path
import hashlib

from core.v5 import artifact_postprocess

class Store:
    def __init__(self, task): self.task=task; self.events=[]
    def get_task(self, task_id): return self.task
    def save_task(self, task): pass
    def append_event(self, task_id, event, payload): self.events.append((event,payload))

def task_for(path, expected):
    return SimpleNamespace(id="x",status="completed",metadata={"firmware_sha256":expected},post_process={},final_path=str(path),error="",error_code="")

def test_published_firmware_sha256_is_enforced(tmp_path):
    path=tmp_path/"fw.zip";path.write_bytes(b"verified firmware")
    expected=hashlib.sha256(path.read_bytes()).hexdigest();task=task_for(path,expected);store=Store(task)
    artifact_postprocess.verify_published_sha256(store,task.id,path)
    assert task.status=="completed" and task.metadata["firmware_sha256_verified"] is True
    assert any(e=="firmware_sha256_verified" for e,_ in store.events)

def test_checksum_mismatch_fails_closed(tmp_path):
    path=tmp_path/"fw.zip";path.write_bytes(b"tampered")
    task=task_for(path,"0"*64);store=Store(task)
    artifact_postprocess.verify_published_sha256(store,task.id,path)
    assert task.status=="failed" and task.error_code=="PUBLISHED_SHA256_MISMATCH"
    assert task.metadata["firmware_sha256_verified"] is False
