"""Automatic loopback authentication for the bundled Lumi browser extension.

The browser extension is part of the same desktop product. It must not require a
manual pairing ceremony on the same computer. External/mobile clients continue
to use the normal one-time pairing API.
"""
from __future__ import annotations

import ipaddress
import secrets
import threading
import time
from typing import Any

from flask import Flask, jsonify, make_response, request

from core.v2.models import utc_now
from .security import _digest


_LOCK = threading.RLock()
_ATTEMPTS: dict[str, list[float]] = {}


def _loopback(value: str) -> bool:
    try:
        return ipaddress.ip_address(value.split("%", 1)[0]).is_loopback
    except ValueError:
        return value in {"localhost", ""}


def _extension_origin(value: str) -> bool:
    return value.startswith(("chrome-extension://", "moz-extension://"))


def _cors(response, origin: str):
    response.headers["Access-Control-Allow-Origin"] = origin
    response.headers["Access-Control-Allow-Headers"] = (
        "Authorization, Content-Type, X-Lumi-Client"
    )
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    response.headers["Vary"] = "Origin"
    return response


def _rate_allowed(key: str) -> bool:
    now = time.time()
    with _LOCK:
        recent = [stamp for stamp in _ATTEMPTS.get(key, []) if now - stamp < 3600]
        if len(recent) >= 12:
            _ATTEMPTS[key] = recent
            return False
        recent.append(now)
        _ATTEMPTS[key] = recent
        return True


def install_local_extension_bootstrap(app: Flask) -> None:
    """Install before the normal auth guard so this exact route can self-auth."""
    if app.extensions.get("lumi_local_extension_bootstrap"):
        return
    app.extensions["lumi_local_extension_bootstrap"] = True

    @app.before_request
    def _local_extension_request():
        if request.path != "/api/security/local-extension":
            return None

        origin = str(request.headers.get("Origin") or "")
        if request.method == "OPTIONS":
            if not _extension_origin(origin):
                return make_response("", 403)
            return _cors(make_response("", 204), origin)
        if request.method != "POST":
            return jsonify({"error": "method not allowed"}), 405
        if not _loopback(request.remote_addr or ""):
            return jsonify({"error": "same-PC authentication is loopback only"}), 403
        if not _extension_origin(origin):
            return jsonify({"error": "browser extension origin required"}), 403
        client_header = str(request.headers.get("X-Lumi-Client") or "")
        if client_header not in {
            "browser-extension-v4",
            "browser-extension-popup-v4",
            "browser-extension-auto-v5",
        }:
            return jsonify({"error": "Lumi extension client header required"}), 403

        value: Any = request.get_json(silent=True)
        data = value if isinstance(value, dict) else {}
        client_id = str(data.get("client_id") or "").strip()
        if len(client_id) < 24 or len(client_id) > 160:
            return jsonify({"error": "valid extension installation id required"}), 400
        rate_key = f"{request.remote_addr}:{_digest(client_id)}"
        if not _rate_allowed(rate_key):
            return jsonify({"error": "too many local authentication requests"}), 429

        services = app.extensions.get("lumi_v4")
        if services is None:
            return jsonify({"error": "Lumi security is still starting"}), 503
        manager = services.security
        client_hash = _digest(client_id)
        records = manager._token_records()
        for record in records:
            if record.get("kind") == "local_extension" and record.get("client_key_hash") == client_hash:
                record["revoked"] = True
                record["revoked_at"] = utc_now()

        token = secrets.token_urlsafe(48)
        record = {
            "id": secrets.token_hex(8),
            "token_hash": _digest(token),
            "role": "owner",
            "client_name": str(data.get("client_name") or "Lumi browser extension")[:120],
            "remote_addr": request.remote_addr or "loopback",
            "created_at": utc_now(),
            "last_seen_at": utc_now(),
            "expires_at": 0,
            "revoked": False,
            "kind": "local_extension",
            "client_key_hash": client_hash,
            "origin": origin,
        }
        records.append(record)
        manager._save_token_records(records)
        response = jsonify(
            {
                "token": token,
                "token_id": record["id"],
                "role": "owner",
                "client_name": record["client_name"],
                "same_pc": True,
            }
        )
        return _cors(response, origin)
