from inspect import signature
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_download_start_route_accepts_desktop_ui_payload(monkeypatch, tmp_path):
    from core.v2 import server_app

    captured = {}

    def fake_start_http(
        url,
        *,
        target_dir,
        filename="",
        overwrite=False,
        resume=True,
        connections=0,
        max_speed_bps=0,
        queue_id="default",
        priority=0,
        start_paused=False,
        request_envelope=None,
        temp_dir=None,
        duplicate_policy="",
        category_id="",
    ):
        captured.update(
            {
                "url": url,
                "target_dir": target_dir,
                "filename": filename,
                "overwrite": overwrite,
                "resume": resume,
                "connections": connections,
                "max_speed_bps": max_speed_bps,
                "queue_id": queue_id,
                "priority": priority,
                "start_paused": start_paused,
                "request_envelope": request_envelope,
                "temp_dir": temp_dir,
                "duplicate_policy": duplicate_policy,
                "category_id": category_id,
            }
        )
        return {
            "id": "desktop-contract-task",
            "status": "queued",
            "filename": filename or "fixture.bin",
            "target_dir": str(target_dir),
        }

    monkeypatch.setattr(server_app, "start_http", fake_start_http)
    target = tmp_path / "downloads"
    target.mkdir()

    with server_app.app.test_client() as client:
        response = client.post(
            "/api/downloads/start",
            json={
                "url": "https://example.invalid/fixture.bin",
                "target_dir": str(target),
                "filename": "fixture.bin",
                "queue_id": "default",
                "category_id": "",
                "connections": 32,
                "duplicate_policy": "rename",
                "overwrite": False,
                "start_paused": False,
                "request_envelope": {
                    "url": "https://example.invalid/fixture.bin",
                    "original_page": "https://example.invalid/fixture.bin",
                    "browser_profile": "",
                },
            },
        )

    assert response.status_code == 200
    body = response.get_json()
    assert body["id"] == "desktop-contract-task"
    assert body["status"] == "queued"
    assert captured["url"] == "https://example.invalid/fixture.bin"
    assert captured["target_dir"] == target
    assert captured["connections"] == 32
    assert captured["duplicate_policy"] == "rename"
    assert captured["queue_id"] == "default"
    assert captured["category_id"] == ""
    assert captured["request_envelope"]["original_page"].endswith("fixture.bin")


def test_public_download_facade_is_category_aware():
    from core import engine_v2

    for name in ("start_http", "start_torrent", "start_video"):
        assert "category_id" in signature(getattr(engine_v2, name)).parameters


def test_download_start_route_rejects_missing_url():
    from core.v2 import server_app

    with server_app.app.test_client() as client:
        response = client.post("/api/downloads/start", json={"connections": 32})

    assert response.status_code == 400
    assert response.get_json()["error"] == "url required"


def test_primary_download_renderer_posts_the_same_contract():
    source = (ROOT / "static" / "main-ui-download.js").read_text(encoding="utf-8")
    for field in (
        "url", "target_dir", "filename", "queue_id", "category_id",
        "connections", "duplicate_policy", "overwrite", "start_paused",
        "request_envelope",
    ):
        assert field in source
    assert 'api("POST", "/api/downloads/start"' in source
    assert "created.push(await verifyCreatedTask(task));" in source
