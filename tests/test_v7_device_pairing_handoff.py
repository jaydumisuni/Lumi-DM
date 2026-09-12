import json
from pathlib import Path

from core.v2.store import StateStore
from core.v4.security import SecurityManager
from core.v7 import device_pairing


def test_pairing_key_roundtrip_carries_destination_identity_and_private_endpoint(tmp_path):
    payload={"schema":device_pairing.PAIR_SCHEMA,"device":{"id":"lumi-pc1","name":"KRATOS","kind":"computer"},"code":"ABCD-EFGH","endpoints":["http://192.168.1.20:7000"],"expires_at":"2026-09-12T00:00:00+00:00"}
    key=device_pairing.encode_pairing_key(payload)
    assert key.startswith("LUMI1.")
    decoded=device_pairing.decode_pairing_key(key)
    assert decoded["device"]["id"]=="lumi-pc1"
    assert decoded["code"]=="ABCD-EFGH"
    assert decoded["endpoints"]==["http://192.168.1.20:7000"]


def test_pairing_key_rejects_public_or_non_http_destinations():
    for endpoint in ("https://example.com:7000","http://8.8.8.8:7000","file:///tmp/x"):
        payload={"schema":device_pairing.PAIR_SCHEMA,"device":{"id":"x","name":"x","kind":"computer"},"code":"ABCD-EFGH","endpoints":[endpoint]}
        try: device_pairing.decode_pairing_key(device_pairing.encode_pairing_key(payload))
        except ValueError: pass
        else: raise AssertionError(endpoint)


def test_local_tool_discovery_is_owner_only_and_stable(tmp_path, monkeypatch):
    monkeypatch.setenv("LUMIDM_DISCOVERY_DIR", str(tmp_path/"discovery"))
    device={"id":"lumi-x","name":"KRATOS","kind":"computer","runtime":"lumi.runtime.v1"}
    first=device_pairing.ensure_local_tool_discovery(tmp_path,device)
    second=device_pairing.ensure_local_tool_discovery(tmp_path,device)
    assert first["secret"]==second["secret"]
    path=Path(first["path"]); assert path.is_file()
    assert path.stat().st_mode & 0o077 == 0
    saved=json.loads(path.read_text())
    assert saved["endpoint"]=="http://127.0.0.1:7000" and saved["device_id"]=="lumi-x"


def test_security_pair_records_client_device_identity(tmp_path):
    store=StateStore(tmp_path); manager=SecurityManager(store)
    issued=manager.create_pairing_code(role="owner",client_name="Phone")
    exchanged=manager.exchange_pairing_code(code=issued["code"],requested_name="John phone",remote_addr="192.168.1.9",device_id="lumi-phone",device_kind="phone")
    clients=manager.list_clients()
    assert exchanged["role"]=="owner"
    assert clients[0]["device_id"]=="lumi-phone" and clients[0]["device_kind"]=="phone"
    store.close()
