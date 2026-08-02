"""Production-facing release-gate tests for the Lumi HTTP engine and browser handoff."""
from __future__ import annotations

import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib
import os
from pathlib import Path
import sys
import threading
import time

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

SIZE = 32 * 1024 * 1024
DATA = bytes(range(256)) * (SIZE // 256)
SHA = hashlib.sha256(DATA).hexdigest()
CHUNK = 64 * 1024
DELAY = 0.004
SLOW_DELAY = 0.020


class QuietRangeServer(ThreadingHTTPServer):
    """Threaded deterministic Range server that ignores expected client disconnects."""

    def handle_error(self, request, client_address):
        """Suppress reset noise caused by segmented probes and cancelled requests."""
        error = sys.exc_info()[1]
        if isinstance(error, (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)


class RangeHandler(BaseHTTPRequestHandler):
    """Serve a fixed payload with correct byte-range and identity headers."""

    protocol_version = "HTTP/1.1"

    def log_message(self, *_args):
        """Keep release-gate logs limited to Lumi evidence."""

    def do_GET(self):
        """Return either the complete payload or the requested inclusive byte range."""
        value = self.headers.get("Range", "")
        if value.startswith("bytes="):
            start_text, end_text = value[6:].split(",", 1)[0].split("-", 1)
            start = int(start_text or 0)
            end = int(end_text) if end_text else SIZE - 1
            start = max(0, min(start, SIZE - 1))
            end = max(start, min(end, SIZE - 1))
            body = memoryview(DATA)[start : end + 1]
            self.send_response(206)
            self.send_header("Content-Range", f"bytes {start}-{end}/{SIZE}")
        else:
            body = memoryview(DATA)
            self.send_response(200)

        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Content-Disposition", 'attachment; filename="release-gate.bin"')
        self.send_header("Content-Length", str(len(body)))
        self.send_header("ETag", '"lumi-release-gate-v1"')
        self.end_headers()
        delay = SLOW_DELAY if "slow=1" in self.path else DELAY
        try:
            for offset in range(0, len(body), CHUNK):
                self.wfile.write(body[offset : offset + CHUNK])
                self.wfile.flush()
                time.sleep(delay)
        except (BrokenPipeError, ConnectionResetError):
            pass


@pytest.fixture(scope="module")
def range_url():
    """Run the deterministic Range endpoint for the complete test module."""
    server = QuietRangeServer(("127.0.0.1", 0), RangeHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield f"http://127.0.0.1:{server.server_port}/release-gate.bin"
    server.shutdown()
    server.server_close()
    thread.join(timeout=5)


@pytest.fixture(scope="module")
def lumi(tmp_path_factory):
    """Start Lumi's real Flask application with isolated persistent directories."""
    root = tmp_path_factory.mktemp("lumi-release-gate")
    keys = ("LUMIDM_DATA_DIR", "LUMIDM_DOWNLOAD_DIR", "LUMIDM_TEMP_DIR")
    previous = {key: os.environ.get(key) for key in keys}
    os.environ.update(
        LUMIDM_DATA_DIR=str(root / "data"),
        LUMIDM_DOWNLOAD_DIR=str(root / "downloads"),
        LUMIDM_TEMP_DIR=str(root / "temporary"),
    )
    for name in list(sys.modules):
        if name == "server" or name.startswith("core."):
            sys.modules.pop(name, None)

    module = importlib.import_module("server")
    client = module.app.test_client()
    client.environ_base["HTTP_ORIGIN"] = "http://localhost"
    client.environ_base["HTTP_X_LUMI_CLIENT"] = "release-gate-test"
    response = client.get("/api/security/bootstrap")
    assert response.status_code == 200, response.get_data(as_text=True)
    try:
        yield client, root
    finally:
        runtime = sys.modules.get("core.v2.runtime")
        current = getattr(runtime, "_RUNTIME", None) if runtime else None
        if current is not None:
            current.close()
            runtime._RUNTIME = None
        for key, original in previous.items():
            if original is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = original


def extension_client(owner):
    """Pair an authenticated Chromium extension client through Lumi's public API."""
    pairing = owner.post(
        "/api/v4/security/pairing",
        json={
            "role": "owner",
            "client_name": "Lumi Chrome Extension release gate",
            "expires_in": 600,
        },
    )
    assert pairing.status_code == 200, pairing.get_data(as_text=True)

    client = owner.application.test_client()
    paired = client.post(
        "/api/security/pair",
        json={
            "code": pairing.get_json()["code"],
            "client_name": "Lumi Chrome Extension release gate",
        },
    )
    assert paired.status_code == 200, paired.get_data(as_text=True)

    client.environ_base["HTTP_ORIGIN"] = "chrome-extension://lumi-release-gate"
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {paired.get_json()['token']}"
    client.environ_base["HTTP_X_LUMI_CLIENT"] = "browser-extension-chromium"
    me = client.get("/api/v4/security/me")
    assert me.status_code == 200
    assert me.get_json()["authenticated"] is True
    assert me.get_json()["can_write"] is True
    return client


def poll(client, task_id, timeout=35):
    """Poll a real Lumi task until it reaches a terminal state."""
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        response = client.get(f"/api/downloads/{task_id}")
        assert response.status_code == 200
        last = response.get_json()
        if last.get("status") in {"completed", "failed", "cancelled", "needs_link"}:
            return last
        time.sleep(0.08)
    pytest.fail(f"task timed out: {last}")


def download(client, url, target, name, connections):
    """Execute a real Lumi HTTP task and prove its final SHA-256 digest."""
    started = time.monotonic()
    response = client.post(
        "/api/downloads/start",
        json={
            "url": url,
            "target_dir": str(target),
            "temp_dir": str(target / ".parts"),
            "filename": name,
            "connections": connections,
            "duplicate_policy": "overwrite",
        },
    )
    assert response.status_code == 200, response.get_data(as_text=True)
    task = response.get_json()
    assert task["connections"] == connections

    result = poll(client, task["id"])
    elapsed = time.monotonic() - started
    assert result["status"] == "completed", result
    file = Path(result["final_path"])
    assert file.exists()
    assert hashlib.sha256(file.read_bytes()).hexdigest() == SHA
    return elapsed, result


def test_default_32_and_saved_setting(lumi):
    """Prove fresh profiles use 32 connections and explicit values persist."""
    client, _ = lumi
    assert client.get("/api/settings").get_json()["default_connections"] == 32
    assert client.post("/api/settings/connections", json={"value": 12}).status_code == 200
    assert client.get("/api/settings").get_json()["default_connections"] == 12
    assert client.post("/api/settings/connections", json={"value": 32}).status_code == 200


def test_real_32_connection_download_is_faster_and_exact(lumi, range_url):
    """Compare one versus 32 connections while requiring identical file content."""
    client, root = lumi
    single_seconds, single = download(client, range_url, root / "downloads", "single.bin", 1)
    parallel_seconds, parallel = download(
        client, range_url, root / "downloads", "parallel.bin", 32
    )
    single_mode = str(single.get("mode") or "").lower()
    parallel_mode = str(parallel.get("mode") or "").lower()
    assert single_mode.startswith("single"), single_mode
    assert any(word in parallel_mode for word in ("adaptive", "parallel", "segmented")), parallel_mode
    ratio = parallel_seconds / single_seconds
    print(
        {
            "single_seconds": round(single_seconds, 3),
            "parallel_seconds": round(parallel_seconds, 3),
            "speed_ratio": round(ratio, 3),
            "single_mode": single_mode,
            "parallel_mode": parallel_mode,
        }
    )
    assert ratio < 0.72, {
        "single": single_seconds,
        "parallel": parallel_seconds,
        "ratio": ratio,
    }


def test_pause_resume_preserves_integrity(lumi, range_url):
    """Force a real pause window, resume it, and verify exact final bytes."""
    client, root = lumi
    response = client.post(
        "/api/downloads/start",
        json={
            "url": f"{range_url}?slow=1",
            "target_dir": str(root / "downloads"),
            "temp_dir": str(root / "temporary"),
            "filename": "resume.bin",
            "connections": 1,
            "duplicate_policy": "overwrite",
        },
    )
    assert response.status_code == 200
    task_id = response.get_json()["id"]

    deadline = time.monotonic() + 15
    before = 0
    while time.monotonic() < deadline:
        task = client.get(f"/api/downloads/{task_id}").get_json()
        before = int(task.get("downloaded_bytes") or 0)
        if task.get("status") == "running" and before >= CHUNK:
            break
        time.sleep(0.02)

    assert before > 0
    assert client.post(f"/api/downloads/{task_id}/pause", json={}).status_code == 200
    deadline = time.monotonic() + 15
    paused = None
    while time.monotonic() < deadline:
        paused = client.get(f"/api/downloads/{task_id}").get_json()
        if paused.get("status") == "paused":
            break
        time.sleep(0.05)

    assert paused and paused.get("status") == "paused", paused
    assert int(paused.get("downloaded_bytes") or 0) >= before
    assert client.post(f"/api/downloads/{task_id}/resume", json={}).status_code == 200
    completed = poll(client, task_id, timeout=45)
    assert completed["status"] == "completed"
    assert hashlib.sha256(Path(completed["final_path"]).read_bytes()).hexdigest() == SHA


def test_chromium_pairing_capture_confirm_and_safe_fallback(lumi, range_url):
    """Prove authenticated takeover and browser-resume fallback from the extension."""
    owner, root = lumi
    extension = extension_client(owner)
    clients = owner.get("/api/v4/security/clients").get_json()["clients"]
    assert any(
        "chrome extension release gate" in str(item.get("client_name") or "").lower()
        for item in clients
    )

    capture = {
        "url": range_url,
        "filename": "extension-confirmed.bin",
        "browser_download_id": "release-gate-1",
        "type": "auto",
        "target_dir": str(root / "downloads"),
        "temp_dir": str(root / "temporary"),
        "connections": 32,
        "request_envelope": {
            "url": range_url,
            "browser_profile": "chromium",
            "suggested_filename": "extension-confirmed.bin",
        },
    }
    staged = extension.post("/api/v5/browser/capture", json=capture)
    assert staged.status_code == 200, staged.get_data(as_text=True)
    staged_data = staged.get_json()
    handoff_id = staged_data["handoff"]["id"]
    task_id = staged_data["task"]["id"]
    assert staged_data["task"]["status"] == "browser_pending"
    assert staged_data["task"]["connections"] == 32

    confirmed = extension.post(
        f"/api/v5/browser/handoffs/{handoff_id}/confirm",
        json={
            "filename": "extension-confirmed.bin",
            "target_dir": str(root / "downloads"),
            "connections": 32,
            "start_mode": "now",
            "duplicate_policy": "overwrite",
        },
    )
    assert confirmed.status_code == 200, confirmed.get_data(as_text=True)
    assert confirmed.get_json()["handoff"]["decision"] == "lumi"
    completed = poll(extension, task_id)
    assert completed["status"] == "completed"
    assert hashlib.sha256(Path(completed["final_path"]).read_bytes()).hexdigest() == SHA

    fallback = extension.post(
        "/api/v5/browser/capture",
        json={
            **capture,
            "filename": "browser-fallback.bin",
            "browser_download_id": "release-gate-2",
        },
    )
    assert fallback.status_code == 200
    fallback_data = fallback.get_json()
    fallback_id = fallback_data["handoff"]["id"]
    fallback_task = fallback_data["task"]["id"]
    resumed = extension.post(f"/api/v5/browser/handoffs/{fallback_id}/browser", json={})
    assert resumed.status_code == 200
    assert resumed.get_json()["decision"] == "browser"
    assert extension.get(f"/api/downloads/{fallback_task}").status_code == 404
