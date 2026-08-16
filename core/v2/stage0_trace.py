"""Bounded Stage-0 packaged Runtime trace support.

This module records only correlation metadata needed to classify physical RC
failures. It intentionally excludes request bodies, query strings, credentials,
headers other than the opaque trace ID, filenames and browser/media content.
"""
from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import re
import threading
from typing import Any

from flask import Flask, request

from . import server_app


_TRACE_ID = re.compile(r"^[A-Za-z0-9._:-]{1,100}$")
_TRACE_FILE = "LUMIDM-stage0-runtime-trace.jsonl"
_LOCK = threading.Lock()


def _safe_trace_id(value: str) -> str:
    text = str(value or "").strip()
    return text if _TRACE_ID.fullmatch(text) else ""


def _path_only() -> str:
    return str(request.path or "")[:180]


def trace_event(event: str, *, trace_id: str = "", **details: Any) -> None:
    trace_id = _safe_trace_id(trace_id)
    allowed = {
        "method",
        "path",
        "status",
        "ok",
        "operation",
        "requested_connections",
        "effective_connections",
        "mode",
        "range_supported",
        "pid",
    }
    payload: dict[str, Any] = {
        "timestamp": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
        "process": "lumi-runtime",
        "event": str(event or "TRACE")[:120],
    }
    if trace_id:
        payload["trace_id"] = trace_id
    for key, value in details.items():
        if key not in allowed or value is None:
            continue
        if isinstance(value, (bool, int, float)):
            payload[key] = value
        else:
            payload[key] = str(value).replace("\n", " ").replace("\r", " ")[:180]
    target = Path(server_app.DATA_DIR) / _TRACE_FILE
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        line = json.dumps(payload, separators=(",", ":"), sort_keys=True)
        with _LOCK:
            with target.open("a", encoding="utf-8") as handle:
                handle.write(line + "\n")
    except OSError:
        pass


def install_stage0_trace(app: Flask) -> None:
    if app.extensions.get("lumi_stage0_trace"):
        return
    app.extensions["lumi_stage0_trace"] = True
    trace_event("RUNTIME_BOOTSTRAPPED")

    @app.before_request
    def _stage0_request_received():
        trace_id = _safe_trace_id(request.headers.get("X-Lumi-Trace-Id", ""))
        if not trace_id:
            return None
        request.environ["lumi.stage0.trace_id"] = trace_id
        trace_event(
            "RUNTIME_RECEIVED",
            trace_id=trace_id,
            method=request.method,
            path=_path_only(),
        )
        return None

    @app.after_request
    def _stage0_response(response):
        trace_id = _safe_trace_id(request.environ.get("lumi.stage0.trace_id", ""))
        if trace_id:
            trace_event(
                "RUNTIME_RESPONSE",
                trace_id=trace_id,
                method=request.method,
                path=_path_only(),
                status=int(response.status_code or 0),
                ok=bool(200 <= int(response.status_code or 0) < 400),
            )
        return response
