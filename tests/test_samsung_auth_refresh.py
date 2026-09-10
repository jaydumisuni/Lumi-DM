from types import SimpleNamespace

from core.v2.models import RequestEnvelope
from core.v2.vault import secure_request_envelope
from core.v5 import samsung_postprocess

class Store:
    def __init__(self, root): self.data_dir=root; self.events=[]
    def save_task(self, task): pass
    def append_event(self, task_id, event, payload): self.events.append((event,payload))

def test_samsung_401_refresh_replaces_only_vaulted_authorization(tmp_path, monkeypatch):
    store=Store(tmp_path)
    secured=secure_request_envelope(tmp_path,{"url":"http://cloud/file","provider_id":"samsung-fus","headers":{"Authorization":"FUS old","User-Agent":"SMART 2.0"}})
    task=SimpleNamespace(id="s1",filename="fw.zip.enc4",request=RequestEnvelope.from_dict(secured),metadata={"samsung_fus_decrypt":{"model":"SM-S921B","csc":"EUX","version":"A/B/C/D","encryption":4}})
    calls=[]
    monkeypatch.setattr(samsung_postprocess.samsung_fus,"refresh_download_authorization",lambda **kw:(calls.append(kw) or "FUS new"))
    assert samsung_postprocess._refresh_samsung_authorization(store,task,{"Authorization":"FUS old"}) is True
    assert task.request.normalized_headers()["Authorization"]=="FUS new"
    assert task.request.headers.get("Authorization") is None
    assert calls[0]["expected_filename"]=="fw.zip.enc4"
    assert any(event=="samsung_fus_authorization_refreshed" for event,_ in store.events)

def test_samsung_refresh_deduplicates_workers_after_another_thread_rotated_token(tmp_path, monkeypatch):
    store=Store(tmp_path)
    secured=secure_request_envelope(tmp_path,{"url":"http://cloud/file","provider_id":"samsung-fus","headers":{"Authorization":"FUS already-new"}})
    task=SimpleNamespace(id="s2",filename="fw.zip.enc4",request=RequestEnvelope.from_dict(secured),metadata={"samsung_fus_decrypt":{"model":"SM-S921B","csc":"EUX","version":"A/B/C/D","encryption":4}})
    monkeypatch.setattr(samsung_postprocess.samsung_fus,"refresh_download_authorization",lambda **kw:(_ for _ in ()).throw(AssertionError("must not refresh twice")))
    assert samsung_postprocess._refresh_samsung_authorization(store,task,{"Authorization":"FUS old"}) is True
