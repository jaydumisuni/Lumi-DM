from __future__ import annotations

import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time

import requests


EXTENSION_ID = "ifgiifbpjflfhibmhaojogjcecpfdljp"
EXTENSION_ORIGIN = f"chrome-extension://{EXTENSION_ID}"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as current:
        current.bind(("127.0.0.1", 0))
        return int(current.getsockname()[1])


def _wait(session: requests.Session, base: str, timeout: float = 25) -> requests.Response:
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        try:
            last = session.get(base, timeout=1)
            if last.status_code == 200:
                return last
        except requests.RequestException:
            pass
        time.sleep(0.15)
    raise AssertionError(f"Lumi Runtime did not start: {getattr(last, 'text', '')}")


def _rpc(session: requests.Session, base: str, method: str, params: dict | None = None):
    response = session.post(
        f"{base}/api/v7/rpc",
        json={"method": method, "params": params or {}},
        headers={"Origin": base},
        timeout=10,
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["schema"] == "lumi.runtime.v1"
    assert payload["ok"] is True
    return payload["result"]


def test_v7_runtime_extension_media_widget_and_remote_contract(tmp_path: Path) -> None:
    root = Path(__file__).resolve().parents[1]
    port = _free_port()
    base = f"http://127.0.0.1:{port}"
    data_dir = tmp_path / "data"
    downloads = tmp_path / "downloads"
    temporary = tmp_path / "temporary"
    log_path = tmp_path / "server.log"
    desktop_secret = "v7-test-desktop-secret"
    runtime_instance = "v7-test-runtime-instance"
    environment = dict(os.environ)
    environment.update({
        "LUMIDM_DATA_DIR": str(data_dir),
        "LUMIDM_DOWNLOAD_DIR": str(downloads),
        "LUMIDM_TEMP_DIR": str(temporary),
        "LUMIDM_DESKTOP_SECRET": desktop_secret,
        "LUMIDM_RUNTIME_INSTANCE": runtime_instance,
        "PYTHONUNBUFFERED": "1",
    })
    log = log_path.open("w", encoding="utf-8")
    process = subprocess.Popen(
        [sys.executable, "server.py", "--host", "127.0.0.1", "--port", str(port)],
        cwd=root,
        env=environment,
        stdout=log,
        stderr=subprocess.STDOUT,
    )
    session = requests.Session()
    try:
        root_response = _wait(session, base)
        assert root_response.headers["X-Lumi-Runtime-Schema"] == "lumi.runtime.v1"
        assert root_response.headers["X-Lumi-Runtime-Instance"] == runtime_instance
        assert int(root_response.headers["X-Lumi-Runtime-Pid"]) == process.pid

        # Protected APIs do not become public merely because they are loopback.
        unauthenticated = requests.get(f"{base}/api/v7/runtime/state", timeout=5)
        assert unauthenticated.status_code == 401

        # The owning Electron shell has one per-process loopback credential.
        desktop = requests.get(
            f"{base}/api/v7/runtime/state",
            headers={
                "X-Lumi-Client": "electron-desktop-test",
                "X-Lumi-Desktop-Secret": desktop_secret,
            },
            timeout=5,
        )
        assert desktop.status_code == 200, desktop.text
        assert desktop.json()["default_connections"] == 32

        bootstrap = session.get(f"{base}/api/security/bootstrap", timeout=5)
        assert bootstrap.status_code == 200, bootstrap.text

        state = session.get(f"{base}/api/v7/runtime/state", timeout=5)
        assert state.status_code == 200, state.text
        state_body = state.json()
        assert state_body["schema"] == "lumi.runtime.v1"
        assert state_body["runtime_instance"] == runtime_instance
        assert state_body["default_connections"] == 32

        # Old/manual remote pairing remains a pairing-code boundary.
        manual = requests.post(
            f"{base}/api/security/pair",
            json={"client_name": "Remote client"},
            timeout=5,
        )
        assert manual.status_code == 400
        assert "pairing code required" in manual.text.lower()

        # Lumi's own fixed-ID browser extension gets same-PC trust, not a code.
        wrong_origin = requests.post(
            f"{base}/api/security/pair",
            json={"mode": "local_extension"},
            headers={"Origin": "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
            timeout=5,
        )
        assert wrong_origin.status_code == 403

        local_extension = requests.post(
            f"{base}/api/security/pair",
            json={"mode": "local_extension", "client_name": "Lumi Chromium"},
            headers={"Origin": EXTENSION_ORIGIN},
            timeout=5,
        )
        assert local_extension.status_code == 200, local_extension.text
        token = local_extension.json()["token"]
        extension_me = requests.get(
            f"{base}/api/v4/security/me",
            headers={"Authorization": f"Bearer {token}", "Origin": EXTENSION_ORIGIN},
            timeout=5,
        )
        assert extension_me.status_code == 200, extension_me.text
        assert extension_me.json()["authenticated"] is True
        assert extension_me.json()["can_write"] is True

        # Every HTTP task reaches the Runtime as 32 even when a stale surface asks for 1.
        created = session.post(
            f"{base}/api/downloads/start",
            json={
                "url": "https://example.invalid/v7-32-proof.bin",
                "filename": "v7-32-proof.bin",
                "target_dir": str(downloads),
                "temp_dir": str(temporary),
                "connections": 1,
                "start_paused": True,
            },
            headers={"Origin": base},
            timeout=8,
        )
        assert created.status_code == 200, created.text
        assert created.json()["connections"] == 32

        # Browser observations are primary evidence and are not truncated to nine.
        observations = [
            {
                "kind": "direct",
                "url": f"https://media.example.invalid/video-{index}.mp4",
                "height": 144 + index * 72,
                "width": 256 + index * 128,
                "fps": 30 if index % 2 else 60,
                "container": "mp4",
                "bitrate": 1_000_000 + index * 100_000,
                "label": f"Variant {index}",
            }
            for index in range(14)
        ]
        media = _rpc(session, base, "media.discover", {
            "url": "https://example.invalid/watch/14",
            "browser": {"url": "https://example.invalid/watch/14", "title": "Fourteen variants"},
            "observations": observations,
            "resolver_fallback": False,
        })
        assert media["state"] == "variants_found"
        assert media["terminal"] is True
        assert len(media["variants"]) == 14
        assert all(item["source"] == "browser" for item in media["variants"])

        no_media = _rpc(session, base, "media.discover", {
            "url": "",
            "browser": {"url": "", "title": "Nothing here"},
            "observations": [],
            "resolver_fallback": False,
        })
        assert no_media["state"] == "no_downloadable_media"
        assert no_media["terminal"] is True

        # Browser capture is the same Runtime task, held in one inactive queue until
        # the existing widget confirms it. It never enters the old browser_pending state.
        captured = _rpc(session, base, "browser.capture", {
            "source": "https://example.invalid/browser-capture.bin",
            "filename": "browser-capture.bin",
            "target_dir": str(downloads),
            "queue_id": "default",
            "browser": {"url": "https://example.invalid/page", "title": "Browser capture"},
            "connections": 1,
        })
        pending = captured["task"]
        assert pending["status"] == "queued"
        assert pending["queue_id"] == "browser-pending"
        assert pending["connections"] == 32
        assert pending["metadata"]["browser_capture_pending"] is True
        assert pending["status"] != "browser_pending"

        snapshot = _rpc(session, base, "runtime.state", {})
        pending_queue = next(item for item in snapshot["queues"] if item["id"] == "browser-pending")
        assert pending_queue["active"] is False
        assert snapshot["device"]["id"].startswith("lumi-")
        assert snapshot["capabilities"]["download_request"] is True
        assert snapshot["capabilities"]["http_connections"] == 32

        confirmed = _rpc(session, base, "browser.confirm", {
            "task_id": pending["id"],
            "filename": "browser-capture.bin",
            "target_dir": str(downloads),
            "queue_id": "default",
            "start_mode": "later",
            "connections": 1,
        })
        confirmed_task = confirmed["task"]
        assert confirmed_task["queue_id"] == "default"
        assert confirmed_task["status"] == "paused"
        assert confirmed_task["connections"] == 32
        assert confirmed_task["metadata"]["browser_capture_pending"] is False

        # Other tools/phones use the same RPC semantics after normal pairing.
        requested = _rpc(session, base, "download.request", {
            "source": "https://example.invalid/remote-request.bin",
            "filename": "remote-request.bin",
            "target_dir": str(downloads),
            "destination_device": "local",
            "connections": 1,
            "start_paused": True,
        })
        remote_id = requested["id"]
        remote_task = _rpc(session, base, "download.status", {"task_id": remote_id})
        assert remote_task["connections"] == 32
        assert remote_task["status"] == "paused"

        wrong_destination = session.post(
            f"{base}/api/v7/rpc",
            json={
                "method": "download.request",
                "params": {
                    "source": "https://example.invalid/wrong-device.bin",
                    "destination_device": "another-lumi-pc",
                    "start_paused": True,
                },
            },
            headers={"Origin": base},
            timeout=8,
        )
        assert wrong_destination.status_code == 400
        assert "route the request" in wrong_destination.text
    finally:
        if process.poll() is None:
            if os.name == "posix":
                process.send_signal(signal.SIGINT)
            else:
                process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
        log.close()

    assert process.returncode in {0, -signal.SIGINT, 130}, log_path.read_text(encoding="utf-8")
