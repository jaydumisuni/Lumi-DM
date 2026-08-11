"""End-to-end release evidence for Lumi's technician and media backends."""
from __future__ import annotations

import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import importlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import time

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

FIRMWARE_BYTES = (bytes(range(256)) * (4 * 1024 * 1024 // 256))
OS_BYTES = (b"LUMI-OS-RELEASE-GATE\n" * 180000)[:4 * 1024 * 1024]


class QuietStaticHandler(SimpleHTTPRequestHandler):
    """Serve deterministic local assets without polluting CI logs."""

    def log_message(self, *_args):
        pass


class QuietStaticServer(ThreadingHTTPServer):
    """Suppress expected disconnect noise from yt-dlp range/probe requests."""

    def handle_error(self, request, client_address):
        error = sys.exc_info()[1]
        if isinstance(error, (BrokenPipeError, ConnectionResetError)):
            return
        super().handle_error(request, client_address)


@pytest.fixture(scope="module")
def specialist_assets(tmp_path_factory):
    """Create deterministic firmware, OS, DASH, and direct-video assets."""
    root = tmp_path_factory.mktemp("lumi-specialist-assets")
    firmware = root / "spark10-release-gate.bin"
    os_image = root / "windows-release-gate.iso"
    firmware.write_bytes(FIRMWARE_BYTES)
    os_image.write_bytes(OS_BYTES)

    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    assert ffmpeg, "ffmpeg is required for the specialist media release gate"
    assert ffprobe, "ffprobe is required for the specialist media release gate"

    direct = root / "direct-stream.mp4"
    subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=320x180:rate=15:duration=2",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=880:sample_rate=44100:duration=2",
            "-shortest",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            str(direct),
        ],
        check=True,
    )

    dash_dir = root / "dash"
    dash_dir.mkdir()
    manifest = dash_dir / "manifest.mpd"
    subprocess.run(
        [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            "testsrc2=size=320x180:rate=15:duration=3",
            "-f",
            "lavfi",
            "-i",
            "sine=frequency=660:sample_rate=44100:duration=3",
            "-map",
            "0:v:0",
            "-map",
            "1:a:0",
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
            "-g",
            "15",
            "-keyint_min",
            "15",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-f",
            "dash",
            "-seg_duration",
            "1",
            str(manifest),
        ],
        check=True,
    )
    assert manifest.is_file()

    handler = lambda *args, **kwargs: QuietStaticHandler(*args, directory=str(root), **kwargs)
    server = QuietStaticServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_port}"
    try:
        yield {
            "root": root,
            "base": base,
            "firmware": firmware,
            "firmware_url": f"{base}/{firmware.name}",
            "firmware_sha256": hashlib.sha256(firmware.read_bytes()).hexdigest(),
            "os": os_image,
            "os_url": f"{base}/{os_image.name}",
            "os_sha256": hashlib.sha256(os_image.read_bytes()).hexdigest(),
            "direct": direct,
            "direct_url": f"{base}/{direct.name}",
            "manifest": manifest,
            "manifest_url": f"{base}/dash/{manifest.name}",
            "ffmpeg": ffmpeg,
            "ffprobe": ffprobe,
        }
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


@pytest.fixture(scope="module")
def lumi(tmp_path_factory, specialist_assets):
    """Start Lumi's real Flask application with an isolated persistent profile."""
    root = tmp_path_factory.mktemp("lumi-specialist-runtime")
    keys = (
        "LUMIDM_DATA_DIR",
        "LUMIDM_DOWNLOAD_DIR",
        "LUMIDM_TEMP_DIR",
        "LUMIDM_FFMPEG",
        "LUMIDM_FFPROBE",
    )
    previous = {key: os.environ.get(key) for key in keys}
    os.environ.update(
        LUMIDM_DATA_DIR=str(root / "data"),
        LUMIDM_DOWNLOAD_DIR=str(root / "downloads"),
        LUMIDM_TEMP_DIR=str(root / "temporary"),
        LUMIDM_FFMPEG=str(specialist_assets["ffmpeg"]),
        LUMIDM_FFPROBE=str(specialist_assets["ffprobe"]),
    )
    for name in list(sys.modules):
        if name == "server" or name.startswith("core."):
            sys.modules.pop(name, None)

    module = importlib.import_module("server")
    client = module.app.test_client()
    client.environ_base["HTTP_ORIGIN"] = "http://localhost"
    client.environ_base["HTTP_X_LUMI_CLIENT"] = "specialist-release-gate"
    bootstrap = client.get("/api/security/bootstrap")
    assert bootstrap.status_code == 200, bootstrap.get_data(as_text=True)
    try:
        yield client, root
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


def extension_client(owner):
    """Create the same authenticated write client used by the Chromium extension."""
    pairing = owner.post(
        "/api/v4/security/pairing",
        json={
            "role": "owner",
            "client_name": "Lumi specialist media extension gate",
            "expires_in": 600,
        },
    )
    assert pairing.status_code == 200, pairing.get_data(as_text=True)
    client = owner.application.test_client()
    paired = client.post(
        "/api/security/pair",
        json={
            "code": pairing.get_json()["code"],
            "client_name": "Lumi specialist media extension gate",
        },
    )
    assert paired.status_code == 200, paired.get_data(as_text=True)
    client.environ_base["HTTP_ORIGIN"] = "chrome-extension://lumi-specialist-gate"
    client.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {paired.get_json()['token']}"
    client.environ_base["HTTP_X_LUMI_CLIENT"] = "browser-extension-chromium"
    me = client.get("/api/v4/security/me")
    assert me.status_code == 200
    assert me.get_json()["authenticated"] is True
    assert me.get_json()["can_write"] is True
    return client


def poll(client, task_id: str, timeout: float = 60.0) -> dict:
    """Wait for a real Lumi task to reach a terminal state."""
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        response = client.get(f"/api/downloads/{task_id}")
        assert response.status_code == 200, response.get_data(as_text=True)
        last = response.get_json()
        if last.get("status") in {"completed", "failed", "cancelled", "needs_link"}:
            return last
        time.sleep(0.08)
    pytest.fail(f"specialist task timed out: {last}")


def assert_exact_file(client, result: dict, expected_sha256: str) -> Path:
    """Require a completed final file and verify it through Lumi's checksum API."""
    assert result["status"] == "completed", result
    final = Path(result["final_path"])
    assert final.is_file(), result
    actual = hashlib.sha256(final.read_bytes()).hexdigest()
    assert actual == expected_sha256
    verified = client.post(
        f"/api/downloads/{result['id']}/verify",
        json={"hash": expected_sha256, "algo": "sha256"},
    )
    assert verified.status_code == 200, verified.get_data(as_text=True)
    payload = verified.get_json()
    assert payload["status"] == "ok", payload
    assert payload["actual"] == expected_sha256
    return final


def stream_types(ffprobe: str, path: Path) -> set[str]:
    """Return codec types found in a generated media result."""
    completed = subprocess.run(
        [
            ffprobe,
            "-v",
            "error",
            "-show_entries",
            "stream=codec_type",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    data = json.loads(completed.stdout or "{}")
    return {str(row.get("codec_type") or "") for row in data.get("streams") or []}


def completed_media_path(result: dict, ffprobe: str) -> Path:
    """Find the actual completed media file and require audio+video streams."""
    candidates = []
    final = Path(str(result.get("final_path") or ""))
    if final.is_file():
        candidates.append(final)
    for value in (result.get("metadata") or {}).get("output_files") or []:
        path = Path(str(value))
        if path.is_file() and path not in candidates:
            candidates.append(path)
    assert candidates, result
    for path in candidates:
        try:
            types = stream_types(ffprobe, path)
        except subprocess.CalledProcessError:
            continue
        if {"video", "audio"}.issubset(types):
            return path
    pytest.fail(f"no completed media output contained both video and audio: {candidates}")


def test_firmware_catalogue_search_stage_confirm_checksum(lumi, specialist_assets):
    """Prove firmware discovery -> stage -> confirm -> final file -> SHA-256."""
    client, runtime_root = lumi
    catalogue = client.get("/api/v5/firmware/catalogue")
    assert catalogue.status_code == 200
    catalogue_data = catalogue.get_json()
    assert "Tecno" in catalogue_data["brands"]
    assert any(item["id"] == "google-pixel" for item in catalogue_data["providers"])

    search = client.get(
        "/api/v5/firmware/search",
        query_string={
            "provider": "needrom",
            "brand": "Tecno",
            "device": "Spark 10",
            "query": "stock firmware",
            "channel": "all",
            "include_community": "true",
        },
    )
    assert search.status_code == 200, search.get_data(as_text=True)
    results = search.get_json()["results"]
    assert results
    assert any(item["provider"] == "needrom" for item in results)
    assert all(item.get("source_url") for item in results)

    target = runtime_root / "firmware"
    staged = client.post(
        "/api/v5/firmware/stage",
        json={
            "url": specialist_assets["firmware_url"],
            "target_dir": str(target),
            "temp_dir": str(runtime_root / "temporary"),
            "filename": "spark10-release-gate.bin",
            "connections": 8,
            "provider": "release-gate-local",
            "source_name": "Lumi deterministic firmware gate",
            "brand": "Tecno",
            "device": "Spark 10",
            "version": "release-gate",
            "channel": "stable",
            "sha256": specialist_assets["firmware_sha256"],
            "source_url": results[0]["source_url"],
            "duplicate_policy": "overwrite",
        },
    )
    assert staged.status_code == 200, staged.get_data(as_text=True)
    task = staged.get_json()
    assert task["status"] == "staged"
    assert task["category_id"] == "firmware"
    assert task["metadata"]["firmware"] is True
    assert task["metadata"]["firmware_sha256"] == specialist_assets["firmware_sha256"]

    events = client.get(f"/api/downloads/{task['id']}/events").get_json()["events"]
    assert any(item.get("event_type") == "firmware_staged" for item in events)

    confirmed = client.post(
        f"/api/downloads/{task['id']}/confirm",
        json={
            "filename": "spark10-release-gate.bin",
            "target_dir": str(target),
            "connections": 8,
        },
    )
    assert confirmed.status_code == 200, confirmed.get_data(as_text=True)
    completed = poll(client, task["id"])
    assert_exact_file(client, completed, specialist_assets["firmware_sha256"])


def test_os_catalogue_search_stage_confirm_checksum(lumi, specialist_assets):
    """Prove OS catalogue/search -> stage -> confirm -> final file -> SHA-256."""
    client, runtime_root = lumi
    catalogue = client.get("/api/v5/os/catalogue")
    assert catalogue.status_code == 200
    catalogue_data = catalogue.get_json()
    assert catalogue_data["families"] == ["Windows", "macOS", "Linux"]
    assert any(item["id"] == "windows-fido" for item in catalogue_data["providers"])

    search = client.get(
        "/api/v5/os/search",
        query_string={
            "family": "Windows",
            "version": "Windows 11",
            "edition": "Home/Pro",
            "architecture": "x64",
            "channel": "all",
            "language": "English International",
        },
    )
    assert search.status_code == 200, search.get_data(as_text=True)
    results = search.get_json()["results"]
    assert results
    assert any(item["provider"] == "windows-fido" for item in results)

    target = runtime_root / "operating-systems"
    staged = client.post(
        "/api/v5/os/stage",
        json={
            "url": specialist_assets["os_url"],
            "target_dir": str(target),
            "temp_dir": str(runtime_root / "temporary"),
            "filename": "windows-release-gate.iso",
            "connections": 8,
            "family": "Windows",
            "distribution": "Windows",
            "version": "Windows 11",
            "edition": "Home/Pro",
            "architecture": "x64",
            "channel": "retail",
            "provider": "release-gate-local",
            "source_name": "Lumi deterministic OS gate",
            "source_url": results[0]["source_url"],
            "sha256": specialist_assets["os_sha256"],
            "duplicate_policy": "overwrite",
        },
    )
    assert staged.status_code == 200, staged.get_data(as_text=True)
    task = staged.get_json()
    assert task["status"] == "staged"
    assert task["category_id"] == "operating-systems"
    assert task["metadata"]["operating_system"] is True
    assert task["metadata"]["os_sha256"] == specialist_assets["os_sha256"]

    events = client.get(f"/api/downloads/{task['id']}/events").get_json()["events"]
    assert any(item.get("event_type") == "operating_system_staged" for item in events)

    confirmed = client.post(
        f"/api/downloads/{task['id']}/confirm",
        json={
            "filename": "windows-release-gate.iso",
            "target_dir": str(target),
            "connections": 8,
        },
    )
    assert confirmed.status_code == 200, confirmed.get_data(as_text=True)
    completed = poll(client, task["id"])
    assert_exact_file(client, completed, specialist_assets["os_sha256"])


def test_real_ytdlp_format_selection_and_mux(lumi, specialist_assets):
    """Use real yt-dlp + ffmpeg to inspect separate DASH tracks and mux the selected pair."""
    owner, runtime_root = lumi
    inspected = owner.get(
        "/api/downloads/video/formats",
        query_string={"url": specialist_assets["manifest_url"]},
    )
    assert inspected.status_code == 200, inspected.get_data(as_text=True)
    media = inspected.get_json()
    formats = media.get("formats") or []
    video = next(
        (row for row in formats if row.get("vcodec") not in {"", "none"} and row.get("acodec") in {"", "none"}),
        None,
    )
    audio = next(
        (row for row in formats if row.get("acodec") not in {"", "none"} and row.get("vcodec") in {"", "none"}),
        None,
    )
    assert video, formats
    assert audio, formats
    selector = f"{video['format_id']}+{audio['format_id']}"

    extension = extension_client(owner)
    target = runtime_root / "media-mux"
    capture = extension.post(
        "/api/v5/browser/capture",
        json={
            "url": specialist_assets["manifest_url"],
            "filename": "selected-dash.mp4",
            "browser_download_id": "specialist-dash-mux",
            "type": "video",
            "target_dir": str(target),
            "format_id": selector,
            "merge_output_format": "mp4",
            "thumbnail": False,
            "embed_thumbnail": False,
            "metadata": False,
            "subtitles": False,
        },
    )
    assert capture.status_code == 200, capture.get_data(as_text=True)
    staged = capture.get_json()
    assert staged["task"]["status"] == "browser_pending"
    assert staged["task"]["metadata"]["format_id"] == selector

    confirmed = extension.post(
        f"/api/v5/browser/handoffs/{staged['handoff']['id']}/confirm",
        json={
            "filename": "selected-dash.mp4",
            "target_dir": str(target),
            "start_mode": "now",
            "duplicate_policy": "overwrite",
        },
    )
    assert confirmed.status_code == 200, confirmed.get_data(as_text=True)
    assert confirmed.get_json()["handoff"]["decision"] == "lumi"

    completed = poll(extension, staged["task"]["id"])
    assert completed["status"] == "completed", completed
    muxed = completed_media_path(completed, specialist_assets["ffprobe"])
    assert muxed.stat().st_size > 0
    assert (completed.get("metadata") or {}).get("output_files")


def test_direct_video_browser_handoff_download(lumi, specialist_assets):
    """Prove a second direct-video source is accepted by browser handoff and completed by Lumi."""
    owner, runtime_root = lumi
    extension = extension_client(owner)
    target = runtime_root / "media-direct"
    capture = extension.post(
        "/api/v5/browser/capture",
        json={
            "url": specialist_assets["direct_url"],
            "filename": "direct-stream.mp4",
            "browser_download_id": "specialist-direct-stream",
            "type": "video",
            "target_dir": str(target),
            "format_id": "best",
            "thumbnail": False,
            "embed_thumbnail": False,
            "metadata": False,
            "subtitles": False,
        },
    )
    assert capture.status_code == 200, capture.get_data(as_text=True)
    staged = capture.get_json()
    handoff_id = staged["handoff"]["id"]
    task_id = staged["task"]["id"]

    confirmed = extension.post(
        f"/api/v5/browser/handoffs/{handoff_id}/confirm",
        json={
            "filename": "direct-stream.mp4",
            "target_dir": str(target),
            "start_mode": "now",
            "duplicate_policy": "overwrite",
        },
    )
    assert confirmed.status_code == 200, confirmed.get_data(as_text=True)
    assert confirmed.get_json()["handoff"]["decision"] == "lumi"

    completed = poll(extension, task_id)
    assert completed["status"] == "completed", completed
    output = completed_media_path(completed, specialist_assets["ffprobe"])
    assert output.stat().st_size > 0
    assert len(hashlib.sha256(output.read_bytes()).hexdigest()) == 64

    handoff = extension.get(f"/api/v5/browser/handoffs/{handoff_id}")
    assert handoff.status_code == 200
    assert handoff.get_json()["decision"] == "lumi"
