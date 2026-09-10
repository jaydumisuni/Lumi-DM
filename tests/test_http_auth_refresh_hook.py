import threading
from types import SimpleNamespace

from core.v2.http_transfer import HTTPTransferRunner
from core.v2.models import RequestEnvelope

class Response:
    def __init__(self,status): self.status_code=status; self.closed=False
    def close(self): self.closed=True

class Session:
    def __init__(self): self.calls=[]; self.responses=[Response(401),Response(206)]
    def get(self,url,**kwargs): self.calls.append((url,dict(kwargs.get("headers") or {}))); return self.responses.pop(0)

class RefreshRunner(HTTPTransferRunner):
    def _refresh_request_authorization(self,task,failed_headers):
        task.request.headers["Authorization"]="FUS new"
        return True

def test_get_retries_one_401_after_provider_refresh_and_preserves_range():
    runner=RefreshRunner(None,"t",pause_event=threading.Event(),cancel_event=threading.Event(),update_callback=lambda t:None)
    task=SimpleNamespace(request=RequestEnvelope(url="http://example.invalid/file",headers={"Authorization":"FUS old"}))
    session=Session()
    response=runner._get_with_auth_refresh(task,session,{"Authorization":"FUS old","Range":"bytes=10-19"})
    assert response.status_code==206
    assert len(session.calls)==2
    assert session.calls[1][1]["Authorization"]=="FUS new"
    assert session.calls[1][1]["Range"]=="bytes=10-19"
