"""Behavioral proof for backend controls exposed by the approved Lumi screens."""
from __future__ import annotations

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import importlib
import os
from pathlib import Path
import sys
import threading

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass


@pytest.fixture()
def approved_backend(tmp_path):
    """Run Lumi against an isolated profile and a real local LinkGrabber site."""
    web = tmp_path / "web"
    web.mkdir()
    (web / "package.zip").write_bytes(b"zip-proof")
    (web / "video.mp4").write_bytes(b"video-proof")
    (web / "manual.pdf").write_bytes(b"pdf-proof")
    (web / "page1.html").write_text(
        """<!doctype html><html><head><link rel='next' href='/page2.html'></head><body>
        <a href='/package.zip'>Package ZIP</a>
        <a href='/video.mp4'>Video MP4</a>
        <a href='https://www.youtube.com/watch?v=lumi-backend-proof'>Video platform</a>
        </body></html>""",
        encoding="utf-8",
    )
    (web / "page2.html").write_text(
        """<!doctype html><html><body><a href='/manual.pdf'>Manual PDF</a></body></html>""",
        encoding="utf-8",
    )
    handler = lambda *args, **kwargs: QuietHandler(*args, directory=str(web), **kwargs)
    web_server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=web_server.serve_forever, daemon=True)
    thread.start()
    origin = f"http://127.0.0.1:{web_server.server_port}"

    keys = ("LUMIDM_DATA_DIR", "LUMIDM_DOWNLOAD_DIR", "LUMIDM_TEMP_DIR")
    previous = {key: os.environ.get(key) for key in keys}
    os.environ.update(
        LUMIDM_DATA_DIR=str(tmp_path / "data"),
        LUMIDM_DOWNLOAD_DIR=str(tmp_path / "downloads"),
        LUMIDM_TEMP_DIR=str(tmp_path / "temporary"),
    )
    for name in list(sys.modules):
        if name == "server" or name.startswith("core."):
            sys.modules.pop(name, None)

    module = importlib.import_module("server")
    client = module.app.test_client()
    client.environ_base["HTTP_ORIGIN"] = "http://localhost"
    client.environ_base["HTTP_X_LUMI_CLIENT"] = "approved-backend-surface"
    bootstrap = client.get("/api/security/bootstrap")
    assert bootstrap.status_code == 200, bootstrap.get_data(as_text=True)

    try:
        yield client, tmp_path, origin
    finally:
        runtime = sys.modules.get("core.v2.runtime")
        current = getattr(runtime, "_RUNTIME", None) if runtime else None
        if current is not None:
            current.close()
            runtime._RUNTIME = None
        for name in list(sys.modules):
            if name == "server" or name.startswith("core."):
                sys.modules.pop(name, None)
        for key, original in previous.items():
            if original is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = original
        web_server.shutdown()
        web_server.server_close()
        thread.join(timeout=5)


def test_overview_download_views_and_capability_backends(approved_backend):
    """Overview/download state screens read real task and capability endpoints."""
    client, _, _ = approved_backend
    capabilities = client.get("/api/capabilities")
    assert capabilities.status_code == 200
    caps = capabilities.get_json()
    assert caps["categories"] is True
    assert caps["resource_resolver"] is True
    assert caps["secure_request_capture"] is True

    downloads = client.get("/api/downloads?limit=50")
    assert downloads.status_code == 200
    assert isinstance(downloads.get_json()["downloads"], list)

    netstats = client.get("/api/netstats")
    assert netstats.status_code == 200
    assert {"rx_bps", "tx_bps", "capacity_bps"}.issubset(netstats.get_json())


def test_categories_are_real_crud(approved_backend):
    """Categories screen can list, add, persist in runtime state, and delete a rule."""
    client, _, _ = approved_backend
    before = client.get("/api/categories")
    assert before.status_code == 200
    assert any(row["id"] == "video" for row in before.get_json()["categories"])

    payload = {
        "id": "release-gate-tools",
        "name": "Release Gate Tools",
        "extensions": ["ttgproof"],
        "domains": ["example.invalid"],
        "folder": "Release Gate Tools",
        "auto_extract": False,
        "enabled": True,
    }
    saved = client.post("/api/categories", json=payload)
    assert saved.status_code == 200, saved.get_data(as_text=True)
    assert saved.get_json()["id"] == payload["id"]

    listed = client.get("/api/categories").get_json()["categories"]
    stored = next(row for row in listed if row["id"] == payload["id"])
    assert stored["extensions"] == ["ttgproof"]
    assert stored["folder"] == "Release Gate Tools"

    deleted = client.delete(f"/api/categories/{payload['id']}")
    assert deleted.status_code == 200, deleted.get_data(as_text=True)
    assert all(row["id"] != payload["id"] for row in client.get("/api/categories").get_json()["categories"])


def test_queues_move_priority_and_crud_are_real(approved_backend):
    """Queues screen can create/update a queue and move/prioritize an actual Lumi task."""
    client, tmp_path, origin = approved_backend
    created = client.post(
        "/api/queues",
        json={"id": "release-gate", "name": "Release Gate", "max_running": 2, "active": False},
    )
    assert created.status_code == 200, created.get_data(as_text=True)
    assert created.get_json()["id"] == "release-gate"

    patched = client.patch(
        "/api/queues/release-gate",
        json={"active": True, "max_running": 3, "speed_limit_bps": 524288},
    )
    assert patched.status_code == 200, patched.get_data(as_text=True)
    assert patched.get_json()["active"] is True
    assert patched.get_json()["max_running"] == 3
    assert patched.get_json()["speed_limit_bps"] == 524288

    staged = client.post(
        "/api/downloads/stage",
        json={
            "url": f"{origin}/package.zip",
            "target_dir": str(tmp_path / "downloads"),
            "filename": "queue-proof.zip",
            "type": "http",
        },
    )
    assert staged.status_code == 200, staged.get_data(as_text=True)
    task_id = staged.get_json()["id"]

    moved = client.post(f"/api/downloads/{task_id}/queue", json={"queue_id": "release-gate"})
    assert moved.status_code == 200, moved.get_data(as_text=True)
    assert moved.get_json()["queue_id"] == "release-gate"

    priority = client.post(f"/api/downloads/{task_id}/priority", json={"priority": 77})
    assert priority.status_code == 200, priority.get_data(as_text=True)
    assert priority.get_json()["priority"] == 77

    queues = client.get("/api/queues")
    assert queues.status_code == 200
    assert any(row["id"] == "release-gate" for row in queues.get_json()["queues"])

    removed_task = client.post(f"/api/downloads/{task_id}/delete", json={"delete_file": False})
    assert removed_task.status_code == 200
    deleted = client.delete("/api/queues/release-gate")
    assert deleted.status_code == 200, deleted.get_data(as_text=True)
    assert all(row["id"] != "release-gate" for row in client.get("/api/queues").get_json()["queues"])


def test_linkgrabber_and_batch_crawl_extract_real_links(approved_backend):
    """LinkGrabber screen hits real HTTP pages and returns file/video candidates."""
    client, _, origin = approved_backend
    grabbed = client.post("/api/grab", json={"url": f"{origin}/page1.html"})
    assert grabbed.status_code == 200, grabbed.get_data(as_text=True)
    links = grabbed.get_json()["links"]
    assert {row.get("ext") for row in links} >= {"zip", "mp4"}

    crawled = client.post(
        "/api/batch/crawl",
        json={
            "url": f"{origin}/page1.html",
            "max_pages": 2,
            "include_files": True,
            "include_videos": True,
        },
    )
    assert crawled.status_code == 200, crawled.get_data(as_text=True)
    payload = crawled.get_json()
    assert payload["pages_crawled"] == 2
    assert any(row.get("ext") == "pdf" for row in payload["links"])
    assert any(row.get("type") == "video" and "youtube.com/watch" in row.get("url", "") for row in payload["links"])


def test_settings_backend_mutates_actual_runtime(approved_backend):
    """Settings screen writes directories, concurrency, connections, and completion action."""
    client, tmp_path, _ = approved_backend
    initial = client.get("/api/settings")
    assert initial.status_code == 200
    assert initial.get_json()["default_connections"] == 32

    new_default = tmp_path / "chosen-downloads"
    new_temp = tmp_path / "chosen-temp"
    saved_default = client.post("/api/settings/default-dir", json={"dir": str(new_default)})
    saved_temp = client.post("/api/settings/temp-dir", json={"dir": str(new_temp)})
    saved_concurrent = client.post("/api/settings/concurrent", json={"value": 5})
    saved_connections = client.post("/api/settings/connections", json={"value": 32})
    saved_completion = client.post("/api/settings/completion-action", json={"action": "none"})

    for response in (saved_default, saved_temp, saved_concurrent, saved_connections, saved_completion):
        assert response.status_code == 200, response.get_data(as_text=True)
    assert Path(saved_default.get_json()["default_dir"]) == new_default
    assert Path(saved_temp.get_json()["temp_dir"]) == new_temp
    assert saved_concurrent.get_json()["max_concurrent"] == 5
    assert saved_connections.get_json()["default_connections"] == 32
    assert saved_completion.get_json()["action"] == "none"

    after = client.get("/api/settings").get_json()
    assert Path(after["default_dir"]) == new_default
    assert Path(after["temp_dir"]) == new_temp
    assert after["max_concurrent"] == 5
    assert after["default_connections"] == 32
    assert after["completion_action"] == "none"
