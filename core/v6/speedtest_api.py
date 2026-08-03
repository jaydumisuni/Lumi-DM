"""Measured network-capacity API for Lumi.

Live download speed and tested connection capacity are deliberately separate:
- live speed is the sum of active Lumi tasks;
- capacity appears only after an explicit Cloudflare measurement succeeds.
"""
from __future__ import annotations

from statistics import median
import os
import time
from typing import Any

from flask import Blueprint, current_app, jsonify

from core.v2.models import utc_now


speedtest_api = Blueprint("lumi_speedtest_v6", __name__, url_prefix="/api/v6")
_KEY = "network.speedtest.last.v1"
_DOWNLOAD_BYTES = 8 * 1024 * 1024
_UPLOAD_BYTES = 2 * 1024 * 1024


def _store():
    services = current_app.extensions.get("lumi_v5")
    if services is None:
        raise RuntimeError("Lumi runtime is unavailable")
    return services.runtime.store


def _set_legacy_capacity(value: int) -> None:
    """Keep existing widget snapshots compatible without treating RX as capacity."""
    try:
        from core.v2 import server_app

        with server_app._net_lock:
            server_app._net_stats["capacity_bps"] = max(0, int(value))
    except Exception:
        pass


def _measure() -> dict[str, Any]:
    import requests

    session = requests.Session()
    session.headers.update({"User-Agent": "Lumi-DM-SpeedTest/1.0"})

    pings: list[float] = []
    for _ in range(3):
        started = time.perf_counter()
        response = session.get(
            "https://speed.cloudflare.com/__down?bytes=1",
            timeout=(5, 10),
        )
        response.raise_for_status()
        _ = response.content
        pings.append((time.perf_counter() - started) * 1000)

    started = time.perf_counter()
    downloaded = 0
    with session.get(
        f"https://speed.cloudflare.com/__down?bytes={_DOWNLOAD_BYTES}",
        stream=True,
        timeout=(8, 30),
    ) as response:
        response.raise_for_status()
        for chunk in response.iter_content(128 * 1024):
            downloaded += len(chunk)
    download_elapsed = max(0.001, time.perf_counter() - started)
    download_bps = int(downloaded / download_elapsed)
    if downloaded < _DOWNLOAD_BYTES // 2 or download_bps <= 0:
        raise RuntimeError("speed test returned insufficient download data")

    upload_bps = 0
    upload_error = ""
    try:
        payload = os.urandom(_UPLOAD_BYTES)
        started = time.perf_counter()
        response = session.post(
            "https://speed.cloudflare.com/__up",
            data=payload,
            headers={"Content-Type": "application/octet-stream"},
            timeout=(8, 30),
        )
        response.raise_for_status()
        upload_elapsed = max(0.001, time.perf_counter() - started)
        upload_bps = int(len(payload) / upload_elapsed)
    except Exception as exc:
        upload_error = str(exc)

    return {
        "state": "complete",
        "provider": "Cloudflare",
        "download_bps": download_bps,
        "download_mbps": round(download_bps * 8 / 1_000_000, 2),
        "upload_bps": upload_bps,
        "upload_mbps": round(upload_bps * 8 / 1_000_000, 2) if upload_bps else None,
        "latency_ms": round(float(median(pings)), 1),
        "bytes_downloaded": downloaded,
        "bytes_uploaded": _UPLOAD_BYTES if upload_bps else 0,
        "upload_error": upload_error,
        "tested_at": utc_now(),
    }


@speedtest_api.get("/speedtest/status")
def speedtest_status():
    result = _store().get_setting(_KEY)
    if not isinstance(result, dict):
        return jsonify({"state": "not_tested", "download_bps": 0, "upload_bps": 0})
    return jsonify(result)


@speedtest_api.post("/speedtest")
@speedtest_api.get("/speedtest")
def run_speedtest():
    try:
        result = _measure()
        _store().set_setting(_KEY, result)
        _set_legacy_capacity(int(result["download_bps"]))
        return jsonify(result)
    except Exception as exc:
        failed = {
            "state": "failed",
            "error": str(exc),
            "download_bps": 0,
            "upload_bps": 0,
            "tested_at": utc_now(),
        }
        _store().set_setting(_KEY, failed)
        _set_legacy_capacity(0)
        return jsonify(failed), 503
