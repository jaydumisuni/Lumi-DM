"""Canonical Runtime/RPC contract for the Lumi correction campaign.

The existing V2 Runtime remains the engine and persistence owner. This layer does
not create another backend; it hardens that Runtime and gives every surface one
versioned domain contract.
"""
from __future__ import annotations

import hashlib
import ipaddress
import os
from pathlib import Path
import secrets
import types
from typing import Any
import uuid

from flask import Blueprint, Flask, jsonify, request

from core.v2.models import TaskStatus, TaskType, utc_now
from core.v2.wave2 import services as wave2_services
from core.v4.api import services as v4_services
from core.v5.api import V5Services


SCHEMA = "lumi.runtime.v1"
CANONICAL_HTTP_CONNECTIONS = 32
LOCAL_EXTENSION_ID = "ifgiifbpjflfhibmhaojogjcecpfdljp"
LOCAL_EXTENSION_ORIGIN = f"chrome-extension://{LOCAL_EXTENSION_ID}"

wave7_api = Blueprint("lumi_wave7", __name__, url_prefix="/api/v7")


def _loopback(value: str) -> bool:
    try:
        return ipaddress.ip_address((value or "").split("%", 1)[0]).is_loopback
    except ValueError:
        return value in {"", "localhost"}


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _runtime():
    return wave2_services().runtime


def _public_task(task: Any) -> dict[str, Any] | None:
    return task.to_dict(public=True) if task is not None else None


def _default_target(runtime: Any) -> Path:
    configured = str(runtime.store.get_setting("default_dir", "") or "").strip()
    return Path(configured).expanduser() if configured else Path.home() / "Downloads"


def _enforce_http_task(runtime: Any, task: Any) -> Any:
    if task is None or str(getattr(task, "type", "")) != TaskType.HTTP.value:
        return task
    changed = int(getattr(task, "connections", 0) or 0) != CANONICAL_HTTP_CONNECTIONS
    task.connections = CANONICAL_HTTP_CONNECTIONS
    task.metadata["connection_policy"] = "canonical-32"
    task.metadata["requested_connections"] = CANONICAL_HTTP_CONNECTIONS
    if changed:
        runtime.store.save_task(task)
        runtime.store.append_event(
            task.id,
            "connection_policy_applied",
            {"connections": CANONICAL_HTTP_CONNECTIONS, "schema": SCHEMA},
        )
    return task


def _install_runtime_policy(runtime: Any) -> None:
    if getattr(runtime, "_lumi_v7_policy", False):
        return
    runtime._lumi_v7_policy = True
    runtime.default_connections = CANONICAL_HTTP_CONNECTIONS
    runtime.store.set_setting("default_connections", CANONICAL_HTTP_CONNECTIONS)

    original_create = runtime.create_http_task
    original_start = runtime._start_task
    original_confirm = runtime.confirm_staged

    def create_http_task(url: str, **kwargs: Any):
        if str(url or "").lower().startswith(("http://", "https://")):
            kwargs["connections"] = CANONICAL_HTTP_CONNECTIONS
        task = original_create(url, **kwargs)
        return _enforce_http_task(runtime, task)

    def start_task(task_id: str) -> None:
        task = runtime.store.get_task(task_id)
        _enforce_http_task(runtime, task)
        original_start(task_id)

    def confirm_staged(task_id: str, *, filename: str, target_dir: str, connections: int):
        task = original_confirm(
            task_id,
            filename=filename,
            target_dir=target_dir,
            connections=CANONICAL_HTTP_CONNECTIONS,
        )
        return _enforce_http_task(runtime, task)

    def set_default_connections(_value: int) -> int:
        runtime.default_connections = CANONICAL_HTTP_CONNECTIONS
        runtime.store.set_setting("default_connections", CANONICAL_HTTP_CONNECTIONS)
        return CANONICAL_HTTP_CONNECTIONS

    runtime.create_http_task = create_http_task
    runtime._start_task = start_task
    runtime.confirm_staged = confirm_staged
    runtime.set_default_connections = set_default_connections

    for task in runtime.list_tasks(5000):
        _enforce_http_task(runtime, task)


def _issue_local_extension_token() -> dict[str, Any]:
    manager = v4_services().security
    token = secrets.token_urlsafe(48)
    records = manager._token_records()  # canonical token store; no parallel auth DB
    for record in records:
        if record.get("local_extension") and not record.get("revoked"):
            record["revoked"] = True
            record["revoked_at"] = utc_now()
    record = {
        "id": secrets.token_hex(8),
        "token_hash": _digest(token),
        "role": "owner",
        "client_name": "Lumi Browser Extension",
        "remote_addr": request.remote_addr or "127.0.0.1",
        "created_at": utc_now(),
        "last_seen_at": utc_now(),
        "expires_at": 0,
        "revoked": False,
        "local_extension": True,
        "extension_id": LOCAL_EXTENSION_ID,
    }
    records.append(record)
    manager._save_token_records(records)
    return {
        "token": token,
        "token_id": record["id"],
        "role": "owner",
        "client_name": record["client_name"],
        "local": True,
        "schema": SCHEMA,
    }


def _install_local_extension_pairing(app: Flask) -> None:
    endpoint = "lumi_wave4.security_pair"
    original = app.view_functions.get(endpoint)
    if original is None or getattr(original, "_lumi_v7_pairing", False):
        return

    def corrected_pairing():
        data = request.get_json(silent=True)
        data = data if isinstance(data, dict) else {}
        if str(data.get("mode") or "") != "local_extension":
            return original()
        origin = str(request.headers.get("Origin") or "").rstrip("/")
        if not _loopback(request.remote_addr or ""):
            return jsonify({"error": "Lumi local extension bootstrap is loopback-only"}), 403
        if origin != LOCAL_EXTENSION_ORIGIN:
            return jsonify({"error": "unrecognized Lumi extension identity"}), 403
        return jsonify(_issue_local_extension_token())

    corrected_pairing._lumi_v7_pairing = True
    app.view_functions[endpoint] = corrected_pairing


def _handoffs(app: Flask):
    services = app.extensions.get("lumi_v5")
    if not isinstance(services, V5Services):
        raise RuntimeError("Lumi V5 handoff service is unavailable")
    return services.handoffs


def _browser_capture(app: Flask, params: dict[str, Any]) -> dict[str, Any]:
    active = wave2_services()
    runtime = active.runtime
    source = str(params.get("source") or params.get("url") or "").strip()
    if not source.startswith(("http://", "https://")):
        raise ValueError("browser capture requires an HTTP or HTTPS source")
    target = Path(str(params.get("target_dir") or _default_target(runtime)))
    target.mkdir(parents=True, exist_ok=True)
    kind = str(params.get("type") or "auto").lower()
    browser = params.get("browser") if isinstance(params.get("browser"), dict) else {}
    media = params.get("media") if isinstance(params.get("media"), dict) else {}

    if kind in {"video", "hls", "dash", "media"}:
        task = runtime.create_delegated_task(
            TaskType.VIDEO.value,
            source,
            target_dir=target,
            metadata={
                "filename": str(params.get("filename") or media.get("title") or "Media download"),
                "format_id": str(params.get("format_id") or media.get("format_id") or "bestvideo+bestaudio/best"),
                "audio_only": bool(params.get("audio_only") or media.get("audio_only")),
                "video_only": bool(params.get("video_only") or media.get("video_only")),
                "detected_type": kind,
                "browser_capture": True,
                "browser_context": browser,
                "media_candidate": media,
            },
            queue_id=str(params.get("queue_id") or "default"),
            priority=int(params.get("priority") or 0),
            start_paused=True,
        )
    else:
        result = active.start_http(
            source,
            target_dir=target,
            temp_dir=Path(str(params.get("temp_dir") or runtime.data_dir / "temporary")),
            filename=str(params.get("filename") or ""),
            connections=CANONICAL_HTTP_CONNECTIONS,
            max_speed_bps=int(params.get("max_speed_bps") or 0),
            queue_id=str(params.get("queue_id") or "default"),
            priority=int(params.get("priority") or 0),
            start_paused=True,
            request_envelope={
                "url": source,
                "final_url": str(params.get("final_url") or source),
                "original_page": str(browser.get("url") or params.get("referrer") or ""),
                "browser_profile": "chromium",
                "suggested_filename": str(params.get("filename") or ""),
            },
            duplicate_policy="rename",
        )
        task = runtime.get_task(str(result.get("id") or ""))
        if task is None:
            raise RuntimeError("Runtime did not persist the browser capture")

    task.status = TaskStatus.STAGED.value
    task.metadata.update({
        "browser_capture": True,
        "browser_capture_pending": True,
        "browser_download_id": str(params.get("browser_download_id") or ""),
        "browser_context": browser,
    })
    runtime.store.save_task(task)
    handoff = _handoffs(app).create(
        task_id=task.id,
        browser_download_id=str(params.get("browser_download_id") or ""),
        original_url=source,
    )
    task.metadata["browser_handoff_id"] = handoff["id"]
    runtime.store.save_task(task)
    runtime.store.append_event(task.id, "browser.capture", {
        "handoff_id": handoff["id"],
        "schema": SCHEMA,
    })
    return {"task": task.to_dict(public=True), "handoff": handoff}


def _browser_confirm(app: Flask, params: dict[str, Any]) -> dict[str, Any]:
    runtime = _runtime()
    task_id = str(params.get("task_id") or "")
    task = runtime.get_task(task_id)
    if task is None:
        raise KeyError("pending browser download not found")
    if not task.metadata.get("browser_capture_pending"):
        raise ValueError("download is not waiting for browser confirmation")

    filename = Path(str(params.get("filename") or task.filename or "download.bin")).name
    target = Path(str(params.get("target_dir") or task.target_dir or _default_target(runtime)))
    target.mkdir(parents=True, exist_ok=True)
    task.filename = filename
    task.target_dir = str(target)
    task.final_path = str(target / filename)
    if task.type == TaskType.HTTP.value:
        task.partial_path = str(Path(task.temp_dir) / f"{filename}.part")
        task.connections = CANONICAL_HTTP_CONNECTIONS
        task.metadata["connection_policy"] = "canonical-32"
    task.metadata["browser_capture_pending"] = False
    start_mode = str(params.get("start_mode") or "now")
    task.status = TaskStatus.PAUSED.value if start_mode == "later" else TaskStatus.QUEUED.value
    runtime.store.save_task(task)
    runtime.store.append_event(task.id, "browser.capture.confirmed", {
        "start_mode": start_mode,
        "schema": SCHEMA,
    })
    handoff_id = str(task.metadata.get("browser_handoff_id") or "")
    if handoff_id:
        _handoffs(app).decide(handoff_id, "lumi", "Confirmed in the Lumi widget")
    if task.status == TaskStatus.QUEUED.value:
        runtime.queue.wake()
    return {"task": task.to_dict(public=True), "handoff_id": handoff_id}


def _browser_release(app: Flask, params: dict[str, Any]) -> dict[str, Any]:
    runtime = _runtime()
    task_id = str(params.get("task_id") or "")
    task = runtime.get_task(task_id)
    if task is None:
        raise KeyError(task_id)
    handoff_id = str(task.metadata.get("browser_handoff_id") or "")
    if handoff_id:
        _handoffs(app).decide(handoff_id, "browser", "Browser retained the download")
    if task.status in {TaskStatus.STAGED.value, TaskStatus.PAUSED.value}:
        runtime.store.delete_task(task.id)
    return {"ok": True, "handoff_id": handoff_id}


def dispatch_rpc(app: Flask, method: str, params: dict[str, Any]) -> Any:
    runtime = _runtime()
    method = str(method or "").strip()
    if method == "runtime.state":
        tasks = runtime.list_tasks(5000)
        return {
            "schema": SCHEMA,
            "runtime_instance": app.config.get("LUMI_RUNTIME_INSTANCE", ""),
            "pid": os.getpid(),
            "default_connections": CANONICAL_HTTP_CONNECTIONS,
            "tasks": [task.to_dict(public=True) for task in tasks],
            "queues": runtime.store.list_queues(),
        }
    if method == "download.create":
        source = str(params.get("source") or params.get("url") or "").strip()
        result = wave2_services().start_http(
            source,
            target_dir=Path(str(params.get("target_dir") or _default_target(runtime))),
            temp_dir=Path(str(params.get("temp_dir") or runtime.data_dir / "temporary")),
            filename=str(params.get("filename") or ""),
            connections=CANONICAL_HTTP_CONNECTIONS,
            max_speed_bps=int(params.get("max_speed_bps") or 0),
            queue_id=str(params.get("queue_id") or "default"),
            priority=int(params.get("priority") or 0),
            start_paused=bool(params.get("start_paused", False)),
            request_envelope=params.get("request_envelope") if isinstance(params.get("request_envelope"), dict) else None,
            duplicate_policy=str(params.get("duplicate_policy") or "rename"),
        )
        return result
    if method == "download.status":
        return _public_task(runtime.get_task(str(params.get("task_id") or "")))
    if method == "download.pause":
        return _public_task(runtime.pause(str(params.get("task_id") or "")))
    if method == "download.resume":
        return _public_task(runtime.resume(str(params.get("task_id") or "")))
    if method == "download.cancel":
        return _public_task(runtime.cancel(str(params.get("task_id") or "")))
    if method == "download.remove":
        return {"ok": runtime.delete(str(params.get("task_id") or ""), delete_file=bool(params.get("delete_file")))}
    if method == "queue.add":
        queue_id = str(params.get("queue_id") or uuid.uuid4().hex[:12])
        return runtime.queue.create_queue(
            str(params.get("name") or "Queue"),
            queue_id=queue_id,
            max_running=int(params.get("max_running") or 0),
            active=bool(params.get("active", True)),
        )
    if method in {"queue.start", "queue.stop"}:
        return runtime.queue.update_queue(
            str(params.get("queue_id") or "default"),
            active=method == "queue.start",
        )
    if method == "browser.capture":
        return _browser_capture(app, params)
    if method == "browser.confirm":
        return _browser_confirm(app, params)
    if method == "browser.release":
        return _browser_release(app, params)
    raise ValueError(f"unsupported Lumi RPC method: {method}")


def install_correction_campaign(app: Flask) -> None:
    if app.extensions.get("lumi_v7"):
        return
    runtime = _runtime()
    _install_runtime_policy(runtime)

    runtime_instance = str(os.environ.get("LUMIDM_RUNTIME_INSTANCE") or uuid.uuid4().hex)
    app.config["LUMI_RUNTIME_INSTANCE"] = runtime_instance
    _install_local_extension_pairing(app)

    @app.after_request
    def _runtime_identity_headers(response):
        if request.path == "/":
            response.headers["X-Lumi-Runtime-Schema"] = SCHEMA
            response.headers["X-Lumi-Runtime-Instance"] = runtime_instance
            response.headers["X-Lumi-Runtime-Pid"] = str(os.getpid())
        return response

    @wave7_api.get("/runtime/state")
    def runtime_state():
        return jsonify(dispatch_rpc(app, "runtime.state", {}))

    @wave7_api.post("/rpc")
    def runtime_rpc():
        data = request.get_json(silent=True)
        data = data if isinstance(data, dict) else {}
        try:
            result = dispatch_rpc(
                app,
                str(data.get("method") or ""),
                data.get("params") if isinstance(data.get("params"), dict) else {},
            )
            return jsonify({"schema": SCHEMA, "ok": True, "result": result})
        except KeyError as exc:
            return jsonify({"schema": SCHEMA, "ok": False, "error": str(exc).strip("'")}), 404
        except (ValueError, FileExistsError) as exc:
            return jsonify({"schema": SCHEMA, "ok": False, "error": str(exc)}), 400
        except Exception as exc:
            return jsonify({"schema": SCHEMA, "ok": False, "error": str(exc)}), 500

    app.register_blueprint(wave7_api)
    app.extensions["lumi_v7"] = {
        "schema": SCHEMA,
        "runtime": runtime,
        "runtime_instance": runtime_instance,
        "extension_id": LOCAL_EXTENSION_ID,
    }

    # Start the loopback bridge only after the HTTP Runtime and auth services
    # exist. Bridge absence is recoverable; it never creates another engine.
    try:
        from .browser_bridge import BrowserBridgeServer
        bridge = BrowserBridgeServer(app)
        bridge.start()
        app.extensions["lumi_v7"]["browser_bridge"] = bridge
    except Exception as exc:
        app.extensions["lumi_v7"]["browser_bridge_error"] = str(exc)
