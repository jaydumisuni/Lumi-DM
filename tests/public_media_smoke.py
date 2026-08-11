"""Public-internet smoke proof for Lumi's real yt-dlp video backend."""
from __future__ import annotations

import importlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

# Stable public MP4 served from GitHub's raw content CDN. This provides a real
# third-party HTTPS media source without account/session cookies.
PUBLIC_VIDEO = "https://raw.githubusercontent.com/mediaelement/mediaelement-files/master/big_buck_bunny.mp4"


@pytest.fixture(scope="module")
def lumi(tmp_path_factory):
    """Start the real Lumi API with an isolated profile and system ffmpeg."""
    root = tmp_path_factory.mktemp("lumi-public-media")
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    assert ffmpeg, "ffmpeg is required for the public media smoke"
    assert ffprobe, "ffprobe is required for the public media smoke"

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
        LUMIDM_FFMPEG=ffmpeg,
        LUMIDM_FFPROBE=ffprobe,
    )
    for name in list(sys.modules):
        if name == "server" or name.startswith("core."):
            sys.modules.pop(name, None)

    module = importlib.import_module("server")
    client = module.app.test_client()
    client.environ_base["HTTP_ORIGIN"] = "http://localhost"
    client.environ_base["HTTP_X_LUMI_CLIENT"] = "public-media-smoke"
    bootstrap = client.get("/api/security/bootstrap")
    assert bootstrap.status_code == 200, bootstrap.get_data(as_text=True)
    try:
        yield client, root, ffprobe
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


def poll(client, task_id: str, timeout: float = 120.0) -> dict:
    """Wait for the public media task to reach a terminal state."""
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        response = client.get(f"/api/downloads/{task_id}")
        assert response.status_code == 200, response.get_data(as_text=True)
        last = response.get_json()
        if last.get("status") in {"completed", "failed", "cancelled", "needs_link"}:
            return last
        time.sleep(0.25)
    pytest.fail(f"public media task timed out: {last}")


def stream_types(ffprobe: str, path: Path) -> set[str]:
    """Read the actual output streams with ffprobe."""
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


def test_public_media_inspect_select_download_and_output(lumi):
    """Prove a real public HTTPS video works through Lumi inspection and download."""
    client, root, ffprobe = lumi
    inspected = client.get(
        "/api/downloads/video/formats",
        query_string={"url": PUBLIC_VIDEO},
    )
    assert inspected.status_code == 200, inspected.get_data(as_text=True)
    media = inspected.get_json()
    assert media.get("source_type") == "media", media
    assert media.get("id"), media
    formats = media.get("formats") or []

    # Direct-file extractors can legitimately expose a single root format rather
    # than a format list. Quality-rich sites are covered by the separate DASH
    # selected-format/mux release gate, so use yt-dlp's canonical best selector
    # for this public direct-media lane when no choices are advertised.
    progressive = next(
        (
            row for row in formats
            if row.get("vcodec") not in {"", "none"}
            and row.get("acodec") not in {"", "none"}
        ),
        None,
    )
    selector = str(progressive["format_id"]) if progressive else "best"

    started = client.post(
        "/api/downloads/video",
        json={
            "url": PUBLIC_VIDEO,
            "target_dir": str(root / "public-media"),
            "format_id": selector,
            "audio_only": False,
            "subtitles": False,
            "category_id": "video",
        },
    )
    assert started.status_code == 200, started.get_data(as_text=True)
    task = started.get_json()
    assert task["metadata"]["format_id"] == selector

    completed = poll(client, task["id"])
    assert completed["status"] == "completed", completed
    outputs = [Path(value) for value in (completed.get("metadata") or {}).get("output_files") or []]
    outputs = [path for path in outputs if path.is_file()]
    if not outputs:
        final = Path(str(completed.get("final_path") or ""))
        if final.is_file():
            outputs = [final]
    assert outputs, completed
    assert any({"video", "audio"}.issubset(stream_types(ffprobe, path)) for path in outputs)
    assert sum(path.stat().st_size for path in outputs) > 0
