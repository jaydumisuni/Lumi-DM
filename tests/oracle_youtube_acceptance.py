"""Local Oracle/Athena acceptance proof for Lumi's real YouTube path.

This is intentionally not a GitHub-hosted CI proof. Oracle runs it on the user's
local Windows machine so YouTube sees the same kind of normal residential/local
browser environment that Lumi will actually use.
"""
from __future__ import annotations

import hashlib
import importlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

YOUTUBE_TEST_URL = "https://www.youtube.com/watch?v=BaW_jenozKc"
TERMINAL = {"completed", "failed", "cancelled", "needs_link"}


def emit(payload: dict) -> None:
    print(json.dumps(payload, ensure_ascii=False))


def classify_failure(text: str) -> str:
    lowered = str(text or "").lower()
    if "sign in to confirm" in lowered or "not a bot" in lowered or "bot" in lowered:
        return "youtube-bot-challenge"
    if "cookies" in lowered or "login" in lowered or "sign in" in lowered:
        return "youtube-session-required"
    if "403" in lowered or "forbidden" in lowered:
        return "youtube-http-403"
    if "429" in lowered or "too many requests" in lowered:
        return "youtube-rate-limit"
    return "youtube-download-failed"


def choose_selector(formats: list[dict]) -> tuple[str, dict]:
    usable = [row for row in formats if str(row.get("format_id") or "")]
    progressive = [
        row for row in usable
        if str(row.get("vcodec") or "none") not in {"", "none"}
        and str(row.get("acodec") or "none") not in {"", "none"}
        and 0 < int(row.get("height") or 0) <= 360
    ]
    if progressive:
        progressive.sort(key=lambda row: (int(row.get("height") or 9999), int(row.get("filesize") or 0) or 10**18))
        row = progressive[0]
        return str(row["format_id"]), {"mode": "progressive", "video": row}

    videos = [
        row for row in usable
        if str(row.get("vcodec") or "none") not in {"", "none"}
        and str(row.get("acodec") or "none") in {"", "none"}
        and 0 < int(row.get("height") or 0) <= 360
    ]
    audios = [
        row for row in usable
        if str(row.get("acodec") or "none") not in {"", "none"}
        and str(row.get("vcodec") or "none") in {"", "none"}
    ]
    if videos and audios:
        videos.sort(key=lambda row: (int(row.get("height") or 9999), int(row.get("filesize") or 0) or 10**18))
        audios.sort(key=lambda row: (float(row.get("abr") or 10**9), int(row.get("filesize") or 0) or 10**18))
        video, audio = videos[0], audios[0]
        return f"{video['format_id']}+{audio['format_id']}", {"mode": "separate", "video": video, "audio": audio}

    return "best[height<=360]/best", {"mode": "fallback"}


def stream_types(ffprobe: str, path: Path) -> set[str]:
    completed = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "stream=codec_type", "-of", "json", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    data = json.loads(completed.stdout or "{}")
    return {str(row.get("codec_type") or "") for row in data.get("streams") or []}


def pair_extension(owner):
    pairing = owner.post(
        "/api/v4/security/pairing",
        json={"role": "owner", "client_name": "Oracle local YouTube acceptance", "expires_in": 600},
    )
    if pairing.status_code != 200:
        raise RuntimeError(f"pairing create failed {pairing.status_code}: {pairing.get_data(as_text=True)}")
    extension = owner.application.test_client()
    paired = extension.post(
        "/api/security/pair",
        json={"code": pairing.get_json()["code"], "client_name": "Oracle local YouTube acceptance"},
    )
    if paired.status_code != 200:
        raise RuntimeError(f"pairing consume failed {paired.status_code}: {paired.get_data(as_text=True)}")
    extension.environ_base["HTTP_ORIGIN"] = "chrome-extension://oracle-lumi-youtube-acceptance"
    extension.environ_base["HTTP_AUTHORIZATION"] = f"Bearer {paired.get_json()['token']}"
    extension.environ_base["HTTP_X_LUMI_CLIENT"] = "browser-extension-chromium"
    return extension


def poll(client, task_id: str, timeout: float = 180.0) -> dict:
    deadline = time.monotonic() + timeout
    last = {}
    while time.monotonic() < deadline:
        response = client.get(f"/api/downloads/{task_id}")
        if response.status_code != 200:
            raise RuntimeError(f"poll failed {response.status_code}: {response.get_data(as_text=True)}")
        last = response.get_json() or {}
        if last.get("status") in TERMINAL:
            return last
        time.sleep(0.25)
    raise TimeoutError(f"YouTube task timed out: {last}")


def main() -> int:
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        emit({"ok": False, "stage": "preflight", "error": "ffmpeg/ffprobe missing"})
        return 2

    with tempfile.TemporaryDirectory(prefix="lumi-oracle-youtube-") as tmp:
        root = Path(tmp)
        previous = {key: os.environ.get(key) for key in (
            "LUMIDM_DATA_DIR", "LUMIDM_DOWNLOAD_DIR", "LUMIDM_TEMP_DIR", "LUMIDM_FFMPEG", "LUMIDM_FFPROBE"
        )}
        os.environ.update(
            LUMIDM_DATA_DIR=str(root / "data"),
            LUMIDM_DOWNLOAD_DIR=str(root / "downloads"),
            LUMIDM_TEMP_DIR=str(root / "temporary"),
            LUMIDM_FFMPEG=ffmpeg,
            LUMIDM_FFPROBE=ffprobe,
        )
        try:
            for name in list(sys.modules):
                if name == "server" or name.startswith("core."):
                    sys.modules.pop(name, None)
            module = importlib.import_module("server")
            owner = module.app.test_client()
            owner.environ_base["HTTP_ORIGIN"] = "http://localhost"
            owner.environ_base["HTTP_X_LUMI_CLIENT"] = "oracle-local-youtube-acceptance"
            bootstrap = owner.get("/api/security/bootstrap")
            if bootstrap.status_code != 200:
                raise RuntimeError(f"bootstrap failed {bootstrap.status_code}: {bootstrap.get_data(as_text=True)}")

            inspected = owner.get("/api/downloads/video/formats", query_string={"url": YOUTUBE_TEST_URL})
            if inspected.status_code != 200:
                body = inspected.get_data(as_text=True)
                emit({
                    "ok": False,
                    "stage": "inspect",
                    "classification": classify_failure(body),
                    "statusCode": inspected.status_code,
                    "detail": body[-4000:],
                    "url": YOUTUBE_TEST_URL,
                })
                return 3

            media = inspected.get_json() or {}
            formats = media.get("formats") or []
            selector, selection = choose_selector(formats)
            extension = pair_extension(owner)
            target = root / "youtube"
            capture = extension.post(
                "/api/v5/browser/capture",
                json={
                    "url": YOUTUBE_TEST_URL,
                    "filename": "lumi-youtube-acceptance",
                    "browser_download_id": "oracle-youtube-local-acceptance",
                    "type": "video",
                    "target_dir": str(target),
                    "format_id": selector,
                    "thumbnail": False,
                    "embed_thumbnail": False,
                    "metadata": False,
                    "subtitles": False,
                },
            )
            if capture.status_code != 200:
                raise RuntimeError(f"browser capture failed {capture.status_code}: {capture.get_data(as_text=True)}")
            staged = capture.get_json()
            confirm = extension.post(
                f"/api/v5/browser/handoffs/{staged['handoff']['id']}/confirm",
                json={
                    "filename": "lumi-youtube-acceptance",
                    "target_dir": str(target),
                    "start_mode": "now",
                    "duplicate_policy": "overwrite",
                },
            )
            if confirm.status_code != 200:
                raise RuntimeError(f"handoff confirm failed {confirm.status_code}: {confirm.get_data(as_text=True)}")

            completed = poll(extension, staged["task"]["id"])
            if completed.get("status") != "completed":
                detail = json.dumps(completed, ensure_ascii=False)
                emit({
                    "ok": False,
                    "stage": "download",
                    "classification": classify_failure(detail),
                    "detail": completed,
                    "url": YOUTUBE_TEST_URL,
                    "selector": selector,
                })
                return 4

            candidates = [Path(str(value)) for value in (completed.get("metadata") or {}).get("output_files") or []]
            final = Path(str(completed.get("final_path") or ""))
            if final.is_file() and final not in candidates:
                candidates.append(final)
            outputs = [path for path in candidates if path.is_file()]
            if not outputs:
                raise RuntimeError(f"completed task has no output file: {completed}")

            verified = None
            for path in outputs:
                try:
                    types = stream_types(ffprobe, path)
                except Exception:
                    continue
                if {"video", "audio"}.issubset(types):
                    verified = (path, types)
                    break
            if verified is None:
                raise RuntimeError(f"no output contains both video and audio: {[str(p) for p in outputs]}")

            output, types = verified
            digest = hashlib.sha256(output.read_bytes()).hexdigest()
            emit({
                "ok": True,
                "stage": "completed",
                "url": YOUTUBE_TEST_URL,
                "title": media.get("title"),
                "mediaId": media.get("id"),
                "formats": len(formats),
                "selector": selector,
                "selection": selection,
                "handoffDecision": (confirm.get_json() or {}).get("handoff", {}).get("decision"),
                "output": str(output),
                "bytes": output.stat().st_size,
                "sha256": digest,
                "streams": sorted(types),
                "ffmpeg": ffmpeg,
                "ffprobe": ffprobe,
            })
            return 0
        except Exception as exc:
            text = str(exc)
            emit({
                "ok": False,
                "stage": "exception",
                "classification": classify_failure(text),
                "detail": text[-4000:],
                "url": YOUTUBE_TEST_URL,
            })
            return 5
        finally:
            runtime = sys.modules.get("core.v2.runtime")
            current = getattr(runtime, "_RUNTIME", None) if runtime else None
            if current is not None:
                current.close()
                runtime._RUNTIME = None
            for key, value in previous.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value


if __name__ == "__main__":
    raise SystemExit(main())
