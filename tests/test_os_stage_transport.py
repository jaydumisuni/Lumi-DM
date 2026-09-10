from pathlib import Path

from core.v2.models import TaskType
from core.v5 import os_api


class FakeService:
    def __init__(self):
        self.calls = []
    def start_http(self, url, **kwargs):
        self.calls.append(("http", url, kwargs))
        return {"id": "http-task"}
    def start_delegated(self, task_type, url, **kwargs):
        self.calls.append(("delegated", task_type, url, kwargs))
        return {"id": "torrent-task"}


def test_os_transfer_routes_http_images_to_http_engine(tmp_path):
    service = FakeService()
    result = os_api._start_os_transfer(service, "https://example.invalid/image.iso", target_dir=tmp_path, temp_dir=tmp_path / "tmp", filename="image.iso")
    assert result["id"] == "http-task"
    assert service.calls[0][0] == "http"
    assert service.calls[0][2]["category_id"] == "operating-systems"


def test_os_transfer_routes_official_torrent_to_existing_torrent_engine(tmp_path):
    service = FakeService()
    result = os_api._start_os_transfer(service, "https://cdimage.kali.org/current/kali-live.iso.torrent", target_dir=tmp_path, temp_dir=tmp_path / "tmp", filename="kali-live.iso.torrent")
    assert result["id"] == "torrent-task"
    kind, task_type, url, kwargs = service.calls[0]
    assert kind == "delegated"
    assert task_type == TaskType.TORRENT.value
    assert kwargs["category_id"] == "operating-systems"
    assert kwargs["start_paused"] is True
    assert kwargs["metadata"]["stop_after_download"] is True
