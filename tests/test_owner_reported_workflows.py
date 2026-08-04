"""Behavioral regression tests for owner-reported Lumi runtime failures."""
from __future__ import annotations

import importlib
import json
import os
from pathlib import Path
import sys

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


@pytest.fixture()
def owner_runtime(tmp_path):
    """Load a fresh isolated Lumi server for each owner workflow test."""
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
    owner = module.app.test_client()
    owner.environ_base["HTTP_ORIGIN"] = "http://localhost"
    owner.environ_base["HTTP_X_LUMI_CLIENT"] = "owner-reported-workflows"
    bootstrap = owner.get("/api/security/bootstrap")
    assert bootstrap.status_code == 200, bootstrap.get_data(as_text=True)
    try:
        yield module, owner, tmp_path
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


def same_pc_extension(app):
    """Authenticate a bundled extension without a manual pairing code."""
    extension = app.test_client()
    extension.environ_base["HTTP_ORIGIN"] = "chrome-extension://lumi-owner-proof"
    extension.environ_base["HTTP_X_LUMI_CLIENT"] = "browser-extension-auto-v5"
    response = extension.post(
        "/api/security/local-extension",
        json={
            "client_id": "lumi-owner-proof-installation-00000001",
            "client_name": "Lumi browser extension owner proof",
        },
    )
    assert response.status_code == 200, response.get_data(as_text=True)
    payload = response.get_json()
    assert payload["same_pc"] is True
    assert payload["token"]
    assert response.headers["Access-Control-Allow-Origin"] == "chrome-extension://lumi-owner-proof"

    extension.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {payload['token']}"
    extension.environ_base["HTTP_X_LUMI_CLIENT"] = "browser-extension-v4"
    me = extension.get("/api/v4/security/me")
    assert me.status_code == 200, me.get_data(as_text=True)
    assert me.get_json()["authenticated"] is True
    assert me.get_json()["can_write"] is True
    return extension


def test_same_pc_extension_never_needs_manual_pairing(owner_runtime):
    module, owner, _ = owner_runtime
    extension = same_pc_extension(module.app)
    assert extension.get("/api/downloads?limit=1").status_code == 200
    clients = owner.get("/api/v4/security/clients").get_json()["clients"]
    active = [item for item in clients if not item.get("revoked")]
    assert any(item.get("kind") == "local_extension" for item in active)


def test_exact_media_quality_is_persisted_into_the_normal_lumi_handoff(owner_runtime):
    module, _owner, root = owner_runtime
    extension = same_pc_extension(module.app)
    target = root / "downloads"
    target.mkdir(parents=True, exist_ok=True)

    staged = extension.post(
        "/api/v5/browser/capture",
        json={
            "url": "https://example.com/watch/owner-quality-proof",
            "filename": "Owner quality proof",
            "type": "video",
            "target_dir": str(target),
            "connections": 32,
            "format_id": "137+bestaudio/best",
            "audio_only": False,
            "video_only": False,
            "subtitles": True,
            "subtitle_languages": ["en"],
            "automatic_subtitles": True,
            "embed_subtitles": True,
            "thumbnail": True,
            "embed_thumbnail": True,
            "metadata": True,
            "merge_output_format": "mp4",
            "request_envelope": {
                "url": "https://example.com/watch/owner-quality-proof",
                "original_page": "https://example.com/watch/owner-quality-proof",
                "browser_profile": "chromium-mv3-media-picker",
            },
        },
    )
    assert staged.status_code == 200, staged.get_data(as_text=True)
    payload = staged.get_json()
    task = payload["task"]
    assert task["status"] == "browser_pending"
    assert task["connections"] == 32
    assert task["metadata"]["format_id"] == "137+bestaudio/best"
    assert task["metadata"]["subtitles"] is True
    assert task["metadata"]["subtitle_languages"] == ["en"]
    assert task["metadata"]["merge_output_format"] == "mp4"

    confirmed = extension.post(
        f"/api/v5/browser/handoffs/{payload['handoff']['id']}/confirm",
        json={
            "filename": "Owner quality proof.mp4",
            "target_dir": str(target),
            "connections": 32,
            "start_mode": "later",
        },
    )
    assert confirmed.status_code == 200, confirmed.get_data(as_text=True)
    confirmed_task = confirmed.get_json()["task"]
    assert confirmed_task["status"] == "paused"
    assert confirmed_task["metadata"]["format_id"] == "137+bestaudio/best"
    assert confirmed_task["metadata"]["subtitle_languages"] == ["en"]

    stored = extension.get(f"/api/downloads/{task['id']}")
    assert stored.status_code == 200
    assert stored.get_json()["metadata"]["format_id"] == "137+bestaudio/best"


def test_duplicate_choice_appears_only_after_real_collision_and_delete_works(owner_runtime):
    module, _owner, root = owner_runtime
    extension = same_pc_extension(module.app)
    target = root / "downloads"
    target.mkdir(parents=True, exist_ok=True)
    existing = target / "duplicate.bin"
    existing.write_bytes(b"keep-me")

    staged = extension.post(
        "/api/v5/browser/capture",
        json={
            "url": "http://127.0.0.1:9/duplicate.bin",
            "filename": existing.name,
            "type": "auto",
            "target_dir": str(target),
            "connections": 32,
            "request_envelope": {
                "url": "http://127.0.0.1:9/duplicate.bin",
                "browser_profile": "chromium",
                "suggested_filename": existing.name,
            },
        },
    )
    assert staged.status_code == 200, staged.get_data(as_text=True)
    handoff = staged.get_json()["handoff"]["id"]
    task_id = staged.get_json()["task"]["id"]

    conflict = extension.post(
        f"/api/v5/browser/handoffs/{handoff}/confirm",
        json={
            "filename": existing.name,
            "target_dir": str(target),
            "connections": 32,
            "start_mode": "later",
        },
    )
    assert conflict.status_code == 409
    assert conflict.get_json()["error"].startswith("DUPLICATE_FILE|")

    accepted = extension.post(
        f"/api/v5/browser/handoffs/{handoff}/confirm",
        json={
            "filename": existing.name,
            "target_dir": str(target),
            "connections": 32,
            "start_mode": "later",
            "duplicate_policy": "rename",
        },
    )
    assert accepted.status_code == 200, accepted.get_data(as_text=True)
    task = accepted.get_json()["task"]
    assert task["status"] == "paused"
    assert task["filename"] != existing.name

    removed = extension.post(
        f"/api/downloads/{task_id}/delete",
        json={"delete_file": False},
    )
    assert removed.status_code == 200, removed.get_data(as_text=True)
    assert existing.read_bytes() == b"keep-me"
    assert extension.get(f"/api/downloads/{task_id}").status_code == 404


def test_speed_test_success_and_failure_are_truthful(owner_runtime, monkeypatch):
    _module, owner, _root = owner_runtime
    speed = importlib.import_module("core.v6.speedtest_api")
    measured = {
        "state": "complete",
        "provider": "Cloudflare",
        "download_bps": 12_500_000,
        "download_mbps": 100.0,
        "upload_bps": 2_500_000,
        "upload_mbps": 20.0,
        "latency_ms": 11.5,
        "bytes_downloaded": 8 * 1024 * 1024,
        "bytes_uploaded": 2 * 1024 * 1024,
        "upload_error": "",
        "tested_at": "2026-08-03T00:00:00Z",
    }
    monkeypatch.setattr(speed, "_measure", lambda: measured)
    success = owner.post("/api/v6/speedtest", json={})
    assert success.status_code == 200
    assert success.get_json()["state"] == "complete"
    assert success.get_json()["download_mbps"] == 100.0

    def fail():
        raise RuntimeError("network unavailable")

    monkeypatch.setattr(speed, "_measure", fail)
    failure = owner.post("/api/v6/speedtest", json={})
    assert failure.status_code == 503
    assert failure.get_json()["state"] == "failed"
    assert failure.get_json()["error"] == "network unavailable"
    assert failure.get_json()["download_bps"] == 0
    status = owner.get("/api/v6/speedtest/status").get_json()
    assert status["state"] == "failed"
    assert status["state"] != "complete"


def test_owner_runtime_source_contracts():
    runtime = (REPO_ROOT / "static" / "lumi-runtime-controls.js").read_text(encoding="utf-8")
    popup = (REPO_ROOT / "browser-extension" / "popup-runtime-fix.js").read_text(encoding="utf-8")
    manifest = json.loads((REPO_ROOT / "browser-extension" / "manifest.json").read_text(encoding="utf-8"))
    media_picker = (REPO_ROOT / "browser-extension" / "media-quality-picker.js").read_text(encoding="utf-8")
    media_bridge = (REPO_ROOT / "browser-extension" / "media-quality-bridge.js").read_text(encoding="utf-8")
    extension_source = (REPO_ROOT / "electron" / "browser-extension-source.js").read_text(encoding="utf-8")
    confirm = (REPO_ROOT / "electron" / "confirm.html").read_text(encoding="utf-8")
    widget = (REPO_ROOT / "electron" / "widget-approved.html").read_text(encoding="utf-8")
    updater = (REPO_ROOT / "electron" / "update-manager.js").read_text(encoding="utf-8")
    preload = (REPO_ROOT / "electron" / "preload-main.js").read_text(encoding="utf-8")
    contract = json.loads((REPO_ROOT / "techguy-build.json").read_text(encoding="utf-8"))
    icon_report = json.loads((REPO_ROOT / "build_config" / "lumi-icon-family.json").read_text(encoding="utf-8"))

    assert "speed_bytes_per_sec" in runtime
    assert "rx_bps" not in runtime
    assert "delete_file" in runtime
    assert "data-runtime-select" in runtime
    assert "lumiEnsureSamePcToken" in popup
    assert "handoff?.id" in popup
    assert 'name="duplicate_policy"' not in confirm
    assert "DUPLICATE_FILE|" in confirm
    assert 'id="close-widget"' in widget
    assert 'id="primary-cancel"' in widget
    assert 'const TOOLS_PAGE = "https://tools.thetechguyds.com/"' in updater
    assert "api.github.com/repos/jaydumisuni/Lumi-DM/releases/latest" in updater
    assert "data-lumi-owner-runtime" in preload

    assert manifest["version"] == "5.1.0"
    assert manifest["content_scripts"][0]["js"] == [
        "content-core.js", "media-quality-picker.js", "content-safety.js"
    ]
    assert "Video + audio" in media_picker
    assert "Audio only" in media_picker
    assert "Subtitles" in media_picker
    assert "format_id" in media_bridge
    assert "resolveCanonicalExtension" in extension_source
    assert not (REPO_ROOT / "static" / "browser-extension" / "chromium").exists()

    assert contract["logo"] == "Resouces/download manager logo.png"
    assert contract["iconSource"] == "Resouces/download manager logo.png"
    assert contract["icons"]["source"] == "Resouces/download manager logo.png"
    assert icon_report["schemaVersion"] == 3
    assert icon_report["source"] == "Resouces/download manager logo.png"
    assert (REPO_ROOT / "Resouces" / "download manager logo.png").exists()
    assert not (REPO_ROOT / "Resouces" / "my_logo.png").exists()
