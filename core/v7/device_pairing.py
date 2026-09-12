from __future__ import annotations

import base64
from datetime import datetime, timezone
import ipaddress
import json
import os
from pathlib import Path
import secrets
from typing import Any
from urllib.parse import urlparse

import psutil

from core.v2.models import utc_now
from core.v2.vault import LocalSecretVault, resolve_secret

PAIR_SCHEMA = "lumi.pair.v1"
DISCOVERY_SCHEMA = "lumi.local-tool.v1"
TARGETS_KEY = "runtime.paired_targets.v1"
DEFAULT_PORT = 7000


def _b64encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _b64decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _private_endpoint(value: str) -> str:
    parsed = urlparse(str(value or "").strip())
    if parsed.scheme != "http" or not parsed.hostname:
        raise ValueError("pairing endpoint must be a private HTTP address")
    try:
        address = ipaddress.ip_address(parsed.hostname)
    except ValueError as exc:
        raise ValueError("pairing endpoint must use a literal private IP address") from exc
    if not (address.is_private or address.is_loopback or address.is_link_local):
        raise ValueError("pairing endpoint must be on the local/private network")
    port = parsed.port or DEFAULT_PORT
    if not (1 <= port <= 65535):
        raise ValueError("invalid pairing endpoint port")
    return f"http://{parsed.hostname}:{port}"


def encode_pairing_key(payload: dict[str, Any]) -> str:
    value = dict(payload or {})
    value.setdefault("schema", PAIR_SCHEMA)
    raw = json.dumps(value, separators=(",", ":"), sort_keys=True).encode("utf-8")
    return "LUMI1." + _b64encode(raw)


def decode_pairing_key(key: str) -> dict[str, Any]:
    text = str(key or "").strip()
    if not text.startswith("LUMI1."):
        raise ValueError("unsupported Lumi pairing key")
    try:
        value = json.loads(_b64decode(text.split(".", 1)[1]).decode("utf-8"))
    except Exception as exc:
        raise ValueError("invalid Lumi pairing key") from exc
    if not isinstance(value, dict) or value.get("schema") != PAIR_SCHEMA:
        raise ValueError("invalid Lumi pairing key schema")
    code = str(value.get("code") or "").strip().upper()
    if len(code) != 9 or code[4] != "-":
        raise ValueError("pairing key has no valid one-time code")
    device = value.get("device") if isinstance(value.get("device"), dict) else {}
    if not str(device.get("id") or "").startswith("lumi-"):
        raise ValueError("pairing key has no Lumi device identity")
    endpoints = [_private_endpoint(item) for item in list(value.get("endpoints") or [])]
    if not endpoints:
        raise ValueError("pairing key has no reachable private endpoint")
    value["code"] = code
    value["endpoints"] = list(dict.fromkeys(endpoints))
    return value


def lan_endpoints(port: int = DEFAULT_PORT) -> list[str]:
    values: list[str] = []
    for entries in psutil.net_if_addrs().values():
        for item in entries:
            address = str(getattr(item, "address", "") or "").split("%", 1)[0]
            try:
                parsed = ipaddress.ip_address(address)
            except ValueError:
                continue
            if parsed.version != 4 or parsed.is_loopback or not (parsed.is_private or parsed.is_link_local):
                continue
            values.append(f"http://{parsed.compressed}:{int(port)}")
    return sorted(set(values))


def pairing_bundle(device: dict[str, Any], issued: dict[str, Any], port: int = DEFAULT_PORT) -> dict[str, Any]:
    endpoints = lan_endpoints(port)
    payload = {
        "schema": PAIR_SCHEMA,
        "device": {"id": str(device.get("id") or ""), "name": str(device.get("name") or "Lumi"), "kind": str(device.get("kind") or "computer")},
        "code": str(issued.get("code") or ""),
        "endpoints": endpoints,
        "expires_at": str(issued.get("expires_at") or ""),
    }
    result = dict(issued)
    result.update({"schema": PAIR_SCHEMA, "device": payload["device"], "endpoints": endpoints})
    result["pairing_key"] = encode_pairing_key(payload) if endpoints else ""
    return result


def _discovery_path() -> Path:
    override = os.environ.get("LUMIDM_DISCOVERY_DIR")
    root = Path(override).expanduser() if override else Path.home() / ".lumi-dm"
    root.mkdir(parents=True, exist_ok=True)
    return root / "local-tool.json"


def ensure_local_tool_discovery(data_dir: Path, device: dict[str, Any]) -> dict[str, Any]:
    path = _discovery_path()
    existing: dict[str, Any] = {}
    try:
        existing = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(existing, dict):
            existing = {}
    except Exception:
        existing = {}
    secret = str(existing.get("secret") or secrets.token_urlsafe(32))
    value = {
        "schema": DISCOVERY_SCHEMA,
        "endpoint": f"http://127.0.0.1:{DEFAULT_PORT}",
        "device_id": str(device.get("id") or ""),
        "device_name": str(device.get("name") or "Lumi"),
        "secret": secret,
        "install_url": "https://thetechguyds.com/tools",
    }
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value, separators=(",", ":"), sort_keys=True), encoding="utf-8")
    try:
        os.chmod(temporary, 0o600)
    except OSError:
        pass
    os.replace(temporary, path)
    try:
        os.chmod(path, 0o600)
    except OSError:
        pass
    return {**value, "path": str(path)}


class PairedTargetRegistry:
    def __init__(self, store):
        self.store = store
        self.vault = LocalSecretVault(Path(store.data_dir))

    def _load(self) -> list[dict[str, Any]]:
        value = self.store.get_setting(TARGETS_KEY, [])
        return [dict(item) for item in (value or []) if isinstance(item, dict)]

    def _save(self, values: list[dict[str, Any]]) -> None:
        self.store.set_setting(TARGETS_KEY, values)

    def remember(self, *, device: dict[str, Any], endpoint: str, token: str, role: str) -> dict[str, Any]:
        endpoint = _private_endpoint(endpoint)
        device_id = str(device.get("id") or "").strip()
        if not device_id.startswith("lumi-") or not token:
            raise ValueError("paired target identity/token is incomplete")
        values = self._load()
        old = next((item for item in values if item.get("id") == device_id), None)
        reference = self.vault.replace(str(old.get("token_reference") or "") if old else "", {"token": token})
        record = {
            "id": device_id,
            "name": str(device.get("name") or device_id)[:120],
            "kind": str(device.get("kind") or "computer")[:32],
            "endpoint": endpoint,
            "role": "owner" if role == "owner" else "read_only",
            "token_reference": reference,
            "created_at": str(old.get("created_at") or utc_now()) if old else utc_now(),
            "last_seen_at": utc_now(),
        }
        values = [item for item in values if item.get("id") != device_id] + [record]
        self._save(values)
        return {key: value for key, value in record.items() if key != "token_reference"}

    def list_public(self) -> list[dict[str, Any]]:
        return [{key: value for key, value in item.items() if key != "token_reference"} for item in self._load()]

    def get(self, device_id: str) -> dict[str, Any] | None:
        return next((item for item in self._load() if str(item.get("id")) == str(device_id)), None)

    def token_for(self, device_id: str) -> str:
        item = self.get(device_id)
        if not item:
            raise KeyError(device_id)
        return str(resolve_secret(str(item.get("token_reference") or "")).get("token") or "")

    def touch(self, device_id: str) -> None:
        values = self._load()
        for item in values:
            if str(item.get("id")) == str(device_id):
                item["last_seen_at"] = utc_now()
        self._save(values)

    def remove(self, device_id: str) -> bool:
        values = self._load()
        found = next((item for item in values if str(item.get("id")) == str(device_id)), None)
        if not found:
            return False
        reference = str(found.get("token_reference") or "")
        if reference:
            self.vault.delete(reference)
        self._save([item for item in values if str(item.get("id")) != str(device_id)])
        return True
