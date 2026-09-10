from types import SimpleNamespace

from core.v2.models import RequestEnvelope
from core.v2.vault import secure_request_envelope, hydrate_provider_secret, hydrate_secret_headers
from core.v5 import samsung_postprocess

class FakeStore:
    def __init__(self, task): self.task=task; self.events=[]
    def get_task(self, task_id): return self.task
    def save_task(self, task): pass
    def append_event(self, task_id, event, payload): self.events.append((event,payload))

def make_task(tmp_path, encrypted):
    secured=secure_request_envelope(tmp_path,{
        "url":"http://cloud-neofussvr.sslcs.cdngc.net/file",
        "headers":{"Authorization":"FUS nonce=SECRET","User-Agent":"Kies2.0_FUS"},
        "provider_secret":{"samsung_decrypt_key":"11"*16},
    })
    return SimpleNamespace(
        id="t1",status="completed",
        metadata={"samsung_fus_decrypt":{"model":"SM-S921B","csc":"EUX","version":"A/B/C/D","encryption":4}},
        post_process={},filename=encrypted.name,final_path=str(encrypted),downloaded_bytes=9,total_bytes=9,
        progress_percent=100.0,finished_at="",error="",error_code="",request=RequestEnvelope.from_dict(secured),
    )

def test_finalize_samsung_package_hydrates_key_destroys_secrets_and_completes(tmp_path, monkeypatch):
    encrypted=tmp_path/"fw.zip.enc4"; encrypted.write_bytes(b"encrypted")
    decrypted=tmp_path/"fw.zip"; task=make_task(tmp_path,encrypted); store=FakeStore(task)
    header_ref=task.request.secret_headers_reference; key_ref=task.request.provider_secret_reference
    seen={}
    def fake_decrypt(source, **kwargs):
        seen.update(kwargs); decrypted.write_bytes(b"zip-output"); return decrypted
    monkeypatch.setattr(samsung_postprocess.samsung_fus, "decrypt_package", fake_decrypt)
    samsung_postprocess.finalize_samsung_package(store, task.id, encrypted)
    assert seen["decrypt_key_hex"] == "11"*16 and seen["encryption"] == 4
    assert task.status == "completed" and task.filename == "fw.zip" and task.final_path == str(decrypted)
    assert not encrypted.exists() and task.metadata["samsung_fus_decrypted"] is True
    assert task.request.secret_headers_reference == "" and task.request.provider_secret_reference == ""
    for ref, hydrator in ((header_ref, hydrate_secret_headers),(key_ref, hydrate_provider_secret)):
        try: hydrator(ref)
        except Exception: pass
        else: raise AssertionError("consumed Samsung secret remained readable")
    assert any(event == "samsung_firmware_decrypted" for event,_ in store.events)

def test_decrypt_failure_destroys_download_auth_but_keeps_key_for_retry(tmp_path, monkeypatch):
    encrypted=tmp_path/"fw.zip.enc4"; encrypted.write_bytes(b"encrypted")
    task=make_task(tmp_path,encrypted); store=FakeStore(task)
    header_ref=task.request.secret_headers_reference; key_ref=task.request.provider_secret_reference
    monkeypatch.setattr(samsung_postprocess.samsung_fus, "decrypt_package", lambda *a,**k: (_ for _ in ()).throw(RuntimeError("decrypt failed")))
    samsung_postprocess.finalize_samsung_package(store, task.id, encrypted)
    assert task.status == "failed" and encrypted.exists() and "decrypt failed" in task.error
    assert task.request.secret_headers_reference == ""
    try: hydrate_secret_headers(header_ref)
    except Exception: pass
    else: raise AssertionError("FUS Authorization remained after transfer")
    assert task.request.provider_secret_reference == key_ref
    assert hydrate_provider_secret(key_ref)["samsung_decrypt_key"] == "11"*16
