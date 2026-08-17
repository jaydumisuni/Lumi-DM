"""Remote-client semantics over the same Lumi Runtime RPC.

Pairing/authentication remains V4-owned. This layer only gives paired tools a
stable destination identity and a download.request operation; it never embeds a
second download manager into another THETECHGUY tool.
"""
from __future__ import annotations

import platform
import uuid


_DEVICE_KEY = "runtime.device_id.v1"


def _device(runtime) -> dict[str, str]:
    device_id = str(runtime.store.get_setting(_DEVICE_KEY, "") or "")
    if not device_id:
        device_id = f"lumi-{uuid.uuid4().hex[:16]}"
        runtime.store.set_setting(_DEVICE_KEY, device_id)
    return {
        "id": device_id,
        "name": platform.node() or "Lumi PC",
        "kind": "computer",
        "runtime": "lumi.runtime.v1",
    }


def install_remote_contract(_app) -> None:
    from . import runtime_contract

    if getattr(runtime_contract.dispatch_rpc, "_lumi_remote_contract", False):
        return
    original = runtime_contract.dispatch_rpc

    def dispatch(app, method, params):
        runtime = runtime_contract._runtime()
        name = str(method or "")
        if name == "runtime.state":
            result = original(app, method, params)
            result["device"] = _device(runtime)
            result["capabilities"] = {
                "download_request": True,
                "http_connections": 32,
                "browser_capture": True,
                "remote_pairing": True,
                "runtime_schema": "lumi.runtime.v1",
            }
            return result
        if name == "runtime.capabilities":
            return {
                "schema": "lumi.runtime.v1",
                "device": _device(runtime),
                "operations": [
                    "download.request", "download.status", "download.pause",
                    "download.resume", "download.cancel", "download.remove",
                    "queue.add", "queue.start", "queue.stop",
                ],
                "http_connections": 32,
            }
        if name == "download.request":
            data = dict(params or {})
            destination = str(data.get("destination_device") or data.get("destinationDevice") or "local").strip()
            device = _device(runtime)
            if destination not in {"", "local", "this_pc", "computer", device["id"]}:
                raise ValueError(
                    f"destination device {destination!r} is not this Lumi Runtime ({device['id']}); route the request to the selected device instead"
                )
            data["connections"] = 32
            return original(app, "download.create", data)
        return original(app, method, params)

    dispatch._lumi_remote_contract = True
    runtime_contract.dispatch_rpc = dispatch
    try:
        from . import browser_bridge
        browser_bridge.dispatch_rpc = dispatch
    except Exception:
        pass
