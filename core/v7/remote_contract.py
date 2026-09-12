"""Remote-device pairing and canonical cross-device download routing."""
from __future__ import annotations

import ipaddress
import platform
import secrets
import uuid
from typing import Any

from flask import jsonify, request
import requests

from core.v2.models import utc_now
from core.v4.api import services as v4_services
from core.v4.security import _digest

from .device_pairing import (
    PairedTargetRegistry,
    decode_pairing_key,
    ensure_local_tool_discovery,
    pairing_bundle,
)

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


def _loopback(value: str) -> bool:
    try:
        return ipaddress.ip_address(str(value or "").split("%", 1)[0]).is_loopback
    except ValueError:
        return str(value or "") in {"", "localhost"}


def _issue_local_tool_token(manager, *, tool_id: str, client_name: str, remote_addr: str) -> dict[str, Any]:
    tool_id = str(tool_id or "ttg-tool").strip()[:120] or "ttg-tool"
    token = secrets.token_urlsafe(32)
    records = manager._token_records()
    for record in records:
        if record.get("local_tool") and record.get("tool_id") == tool_id and not record.get("revoked"):
            record["revoked"] = True
            record["revoked_at"] = utc_now()
    record = {
        "id": secrets.token_hex(8),
        "token_hash": _digest(token),
        "role": "owner",
        "client_name": str(client_name or tool_id).strip()[:120] or tool_id,
        "remote_addr": remote_addr,
        "created_at": utc_now(),
        "last_seen_at": utc_now(),
        "expires_at": 0,
        "revoked": False,
        "local_tool": True,
        "tool_id": tool_id,
        "device_kind": "computer",
    }
    records.append(record)
    manager._save_token_records(records)
    return {
        "token": token,
        "token_id": record["id"],
        "role": "owner",
        "client_name": record["client_name"],
        "local": True,
        "schema": "lumi.runtime.v1",
    }


def _rpc_to_target(registry: PairedTargetRegistry, device_id: str, method: str, params: dict[str, Any]) -> Any:
    peer = registry.get(device_id)
    if not peer:
        raise ValueError(f"Lumi destination {device_id!r} is not paired")
    token = registry.token_for(device_id)
    if not token:
        raise PermissionError("paired Lumi destination has no usable credential")
    endpoint = str(peer.get("endpoint") or "").rstrip("/")
    session = requests.Session()
    session.trust_env = False
    response = session.post(
        f"{endpoint}/api/v7/rpc",
        headers={"Authorization": f"Bearer {token}", "X-Lumi-Client": "lumi-device-router"},
        json={"method": method, "params": dict(params or {})},
        timeout=(5, 30),
    )
    if response.status_code in {401, 403}:
        raise PermissionError("paired Lumi destination rejected its credential")
    response.raise_for_status()
    value = response.json()
    if not value.get("ok"):
        raise RuntimeError(str(value.get("error") or "remote Lumi request failed"))
    registry.touch(device_id)
    return value.get("result")


def _pair_target(runtime, pairing_key: str) -> dict[str, Any]:
    payload = decode_pairing_key(pairing_key)
    expected = dict(payload["device"])
    local = _device(runtime)
    last_error: Exception | None = None
    session = requests.Session()
    session.trust_env = False
    for endpoint in payload["endpoints"]:
        try:
            paired = session.post(
                f"{endpoint}/api/security/pair",
                json={
                    "code": payload["code"],
                    "client_name": local["name"],
                    "device_id": local["id"],
                    "device_kind": local["kind"],
                },
                timeout=(5, 15),
            )
            if paired.status_code >= 400:
                raise RuntimeError(str((paired.json() if paired.content else {}).get("error") or f"pairing failed ({paired.status_code})"))
            auth = paired.json()
            token = str(auth.get("token") or "")
            if not token:
                raise RuntimeError("target Lumi did not issue a paired credential")
            state_response = session.get(
                f"{endpoint}/api/v7/runtime/state",
                headers={"Authorization": f"Bearer {token}", "X-Lumi-Client": "lumi-device-pairing"},
                timeout=(5, 15),
            )
            state_response.raise_for_status()
            actual = dict(state_response.json().get("device") or {})
            if str(actual.get("id") or "") != str(expected.get("id") or ""):
                raise RuntimeError("pairing endpoint identity does not match the generated Lumi key")
            registry = PairedTargetRegistry(runtime.store)
            target = registry.remember(device=actual, endpoint=endpoint, token=token, role=str(auth.get("role") or "read_only"))
            return target
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"could not reach the Lumi device in this pairing key: {last_error}")


def install_remote_contract(app) -> None:
    from . import runtime_contract

    runtime = runtime_contract._runtime()
    registry = PairedTargetRegistry(runtime.store)
    device = _device(runtime)
    discovery = ensure_local_tool_discovery(runtime.store.data_dir, device)
    app.extensions["lumi_paired_targets"] = registry
    app.extensions["lumi_local_tool_discovery"] = {key: value for key, value in discovery.items() if key != "secret"}

    # Extend the already-public pairing endpoint with a same-machine tool mode.
    pair_endpoint = "lumi_wave4.security_pair"
    original_pair = app.view_functions.get(pair_endpoint)
    if original_pair is not None and not getattr(original_pair, "_lumi_local_tool_pairing", False):
        def pairing_entry():
            data = request.get_json(silent=True)
            data = data if isinstance(data, dict) else {}
            if str(data.get("mode") or "") != "local_tool":
                return original_pair()
            if not _loopback(request.remote_addr or ""):
                return jsonify({"error": "same-device tool bootstrap is loopback-only"}), 403
            supplied = str(data.get("secret") or "")
            if not supplied or not secrets.compare_digest(supplied, str(discovery.get("secret") or "")):
                return jsonify({"error": "local Lumi discovery credential is invalid"}), 403
            result = _issue_local_tool_token(
                v4_services().security,
                tool_id=str(data.get("tool_id") or "ttg-tool"),
                client_name=str(data.get("client_name") or data.get("tool_id") or "THETECHGUY tool"),
                remote_addr=request.remote_addr or "127.0.0.1",
            )
            result["device"] = device
            return jsonify(result)
        pairing_entry._lumi_local_tool_pairing = True
        app.view_functions[pair_endpoint] = pairing_entry

    if "lumi_device_pairing_issue" not in app.view_functions:
        def issue_pairing():
            data = request.get_json(silent=True)
            data = data if isinstance(data, dict) else {}
            issued = v4_services().security.create_pairing_code(
                role=str(data.get("role") or "owner"),
                client_name=str(data.get("client_name") or "Another Lumi device"),
                expires_in=int(data.get("expires_in") or 600),
            )
            try:
                port = int(str(request.host).rsplit(":", 1)[1]) if ":" in str(request.host) else 7000
            except ValueError:
                port = 7000
            return jsonify(pairing_bundle(device, issued, port=port))
        app.add_url_rule("/api/v7/devices/pairing", "lumi_device_pairing_issue", issue_pairing, methods=["POST"])

        def pair_target():
            data = request.get_json(silent=True)
            data = data if isinstance(data, dict) else {}
            key = str(data.get("pairing_key") or data.get("key") or "")
            try:
                return jsonify({"paired": _pair_target(runtime, key)})
            except (ValueError, PermissionError) as exc:
                return jsonify({"error": str(exc)}), 400
            except Exception as exc:
                return jsonify({"error": str(exc)}), 502
        app.add_url_rule("/api/v7/devices/pair", "lumi_device_pair_target", pair_target, methods=["POST"])

        def list_targets():
            return jsonify({"local": device, "targets": registry.list_public()})
        app.add_url_rule("/api/v7/devices", "lumi_device_targets", list_targets, methods=["GET"])

        def remove_target(device_id: str):
            if not registry.remove(device_id):
                return jsonify({"error": "paired Lumi destination not found"}), 404
            return jsonify({"status": "removed", "id": device_id})
        app.add_url_rule("/api/v7/devices/<device_id>", "lumi_device_target_remove", remove_target, methods=["DELETE"])

    if getattr(runtime_contract.dispatch_rpc, "_lumi_remote_contract", False):
        return
    original = runtime_contract.dispatch_rpc

    def dispatch(app_value, method, params):
        name = str(method or "")
        if name == "runtime.state":
            result = original(app_value, method, params)
            result["device"] = device
            result["paired_destinations"] = registry.list_public()
            result["capabilities"] = {
                "download_request": True,
                "http_connections": 32,
                "browser_capture": True,
                "remote_pairing": True,
                "device_routing": True,
                "same_device_tool_bootstrap": True,
                "runtime_schema": "lumi.runtime.v1",
            }
            return result
        if name == "runtime.capabilities":
            return {
                "schema": "lumi.runtime.v1",
                "device": device,
                "paired_destinations": registry.list_public(),
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
            if destination not in {"", "local", "this_pc", "computer", device["id"]}:
                data["destination_device"] = destination
                data["connections"] = 32
                return {
                    "routed": True,
                    "destination": destination,
                    "result": _rpc_to_target(registry, destination, "download.request", data),
                }
            data["connections"] = 32
            return original(app_value, "download.create", data)
        return original(app_value, method, params)

    dispatch._lumi_remote_contract = True
    runtime_contract.dispatch_rpc = dispatch
    try:
        from . import browser_bridge
        browser_bridge.dispatch_rpc = dispatch
    except Exception:
        pass
