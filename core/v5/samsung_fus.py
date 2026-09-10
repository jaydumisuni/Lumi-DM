from __future__ import annotations

from dataclasses import dataclass
import hashlib
from pathlib import Path
import re
from typing import Any
from urllib.parse import quote
import xml.etree.ElementTree as ET

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
import requests

# Current Samsung SmartDownload FUS protocol, independently implemented from
# public interoperability evidence. Protocol reference: topjohnwu/samloader-rs
# (Apache-2.0), pinned to this reviewed commit.
_PROTOCOL_REFERENCE_COMMIT = "2b9d59054f863c540578dc2dce429daaefb3460e"
_FUS_META = "https://neofussvr.sslcs.cdngc.net/"
_FUS_CLOUD = "http://cloud-neofussvr.samsungmobile.com/NF_SmartDownloadBinaryForMass.do"
_FOTA = "https://fota-cloud-dn.ospserver.net:443/firmware"
_SMART_UA = "SMART 2.0"
_FOTA_UA = "Kies2.0_FUS"
_AUTH_AES_KEY = bytes([
    0x42, 0x2E, 0x73, 0x73, 0x36, 0x17, 0xAE, 0x2B,
    0x19, 0x89, 0x40, 0xFD, 0x4E, 0x32, 0xB0, 0xA5,
])


def normalize_model(value: str) -> str:
    model = str(value or "").strip().upper()
    if not re.fullmatch(r"SM-[A-Z0-9]{3,12}", model):
        raise ValueError("Samsung model must be an exact SM- model identifier")
    return model


def normalize_csc(value: str) -> str:
    csc = str(value or "").strip().upper()
    if not re.fullmatch(r"[A-Z0-9]{3}", csc):
        raise ValueError("Samsung CSC must be exactly 3 letters/numbers")
    return csc


def normalize_version_code(value: str) -> str:
    parts = str(value or "").strip().split("/")
    if len(parts) == 3:
        parts.append(parts[0])
    if len(parts) < 3 or not parts[0]:
        raise ValueError("Samsung firmware version has an invalid shape")
    if not parts[2]:
        parts[2] = parts[0]
    if len(parts) == 3:
        parts.append(parts[0])
    if len(parts) != 4:
        raise ValueError("Samsung firmware version has an invalid shape")
    return "/".join(parts)


def _logic_check(value: str, nonce: str) -> str:
    text = str(value or "")
    out: list[str] = []
    for character in str(nonce or ""):
        index = ord(character) & 0xF
        out.append(text[index] if index < len(text) else ".")
    return "".join(out)


def _auth_signature(nonce: str) -> str:
    block = bytearray(b"0" * 16)
    raw = str(nonce or "").encode()[:16]
    block[:len(raw)] = raw
    encryptor = Cipher(algorithms.AES(_AUTH_AES_KEY), modes.ECB()).encryptor()
    return (encryptor.update(bytes(block)) + encryptor.finalize()).hex()


def _request_xml(params: dict[str, Any], *, put_cmd_id: str = "", include_binary_version_get: bool = False) -> bytes:
    root = ET.Element("FUSMsg")
    header = ET.SubElement(root, "FUSHdr")
    ET.SubElement(header, "ProtoVer").text = "1.0"
    ET.SubElement(header, "SessionID").text = "0"
    ET.SubElement(header, "MsgID").text = "1"
    body = ET.SubElement(root, "FUSBody")
    put = ET.SubElement(body, "Put")
    if put_cmd_id:
        ET.SubElement(put, "CmdID").text = put_cmd_id
    for name, value in params.items():
        node = ET.SubElement(put, name)
        ET.SubElement(node, "Data").text = str(value)
    if include_binary_version_get:
        get = ET.SubElement(body, "Get")
        ET.SubElement(get, "CmdID").text = "2"
        ET.SubElement(get, "BINARY_SW_VERSION")
    return ET.tostring(root)


def _binary_inform(version: str, model: str, csc: str, nonce: str) -> bytes:
    return _request_xml({
        "ACCESS_MODE": 1,
        "BINARY_NATURE": 1,
        "REQUEST_TYPE": 2,
        "LOGIC_CHECK": _logic_check(version, nonce),
        "BINARY_SW_VERSION": version,
        "BINARY_LOCAL_CODE": csc,
        "BINARY_MODEL_NAME": model,
    }, put_cmd_id="1", include_binary_version_get=True)


def _binary_init(filename: str, nonce: str, version: str, model_type: str, csc: str) -> bytes:
    if len(filename) < 25:
        raise ValueError("Samsung firmware filename is too short for FUS initialization")
    check_input = filename[-25:-9]
    return _request_xml({
        "BINARY_NAME": filename,
        "BINARY_SW_VERSION": version,
        "DEVICE_LOCAL_CODE": csc,
        "DEVICE_MODEL_TYPE": model_type,
        "LOGIC_CHECK": _logic_check(check_input, nonce),
    })


def _text(root: ET.Element, path: str) -> str:
    value = root.findtext(path)
    return str(value or "").strip()


def _data(root: ET.Element, *names: str) -> str:
    for name in names:
        value = _text(root, f".//{name}/Data")
        if value:
            return value
    return ""


@dataclass(slots=True)
class SamsungResolvedPackage:
    model: str
    csc: str
    version: str
    filename: str
    size: int
    url: str
    authorization: str
    encryption: int
    decrypt_key_hex: str = ""
    model_type: str = ""

    def request_envelope(self) -> dict[str, Any]:
        value = {
            "url": self.url,
            "provider_id": "samsung-fus",
            "suggested_filename": self.filename,
            "headers": {"Authorization": self.authorization, "User-Agent": _SMART_UA},
        }
        if self.decrypt_key_hex:
            value["provider_secret"] = {"samsung_decrypt_key": self.decrypt_key_hex}
        return value


class SamsungFUSClient:
    def __init__(self, *, session: requests.Session | None = None):
        self.session = session or requests.Session()
        self.auth = ""
        self.encnonce = ""
        self.nonce = ""
        self.request("NF_SmartDownloadGenerateNonce.do")

    def _authorization(self) -> str:
        return f'FUS nonce="{self.encnonce}", signature="{self.auth}", nc="", type="", realm="", newauth="1"'

    def request(self, path: str, data: bytes | str = b"") -> str:
        response = self.session.post(
            _FUS_META + path,
            data=data,
            headers={"Authorization": self._authorization(), "User-Agent": _SMART_UA},
            timeout=(15, 30),
        )
        response.raise_for_status()
        encoded = str(response.headers.get("NONCE") or response.headers.get("nonce") or "")
        if encoded and encoded != self.encnonce:
            self.encnonce = encoded
            self.nonce = encoded
            self.auth = _auth_signature(encoded)
        return response.text

    def cloud_authorization(self) -> str:
        if not self.encnonce or not self.auth:
            raise RuntimeError("Samsung FUS session did not establish cloud authorization")
        return self._authorization()


def _latest_version(model: str, csc: str, *, session: requests.Session | None = None) -> str:
    active = session or requests.Session()
    response = active.get(
        f"{_FOTA}/{quote(csc)}/{quote(model)}/version.xml",
        headers={"User-Agent": _FOTA_UA},
        timeout=(15, 30),
    )
    if response.status_code == 403:
        raise ValueError("Samsung model/CSC combination was not found")
    response.raise_for_status()
    root = ET.fromstring(response.text)
    latest = _text(root, "./firmware/version/latest")
    if not latest:
        raise RuntimeError("Samsung FOTA returned no latest firmware version")
    return normalize_version_code(latest)


def _parse_binary_inform(xml: str, *, model: str, csc: str, version: str, client: SamsungFUSClient) -> SamsungResolvedPackage:
    root = ET.fromstring(xml)
    status = _text(root, "./FUSBody/Results/Status")
    if status not in {"200", "S00"}:
        raise RuntimeError(f"Samsung FUS BinaryInform returned status {status or 'unknown'}")
    filename = _data(root, "BINARY_NAME")
    path = _data(root, "MODEL_PATH")
    size = int(_data(root, "BINARY_BYTE_SIZE") or 0)
    server_version = _data(root, "BINARY_SW_VERSION", "LATEST_FW_VERSION") or version
    logic_value = _data(root, "LOGIC_VALUE_FACTORY", "LOGIC_VALUE_HOME")
    model_type = _data(root, "DEVICE_MODEL_TYPE") or model
    region = _data(root, "BINARY_LOCAL_CODE") or csc
    if not filename or not path or size <= 0 or not logic_value:
        raise RuntimeError("Samsung FUS returned incomplete package metadata")
    key = hashlib.md5(_logic_check(server_version, logic_value).encode()).digest()
    encryption = 2 if filename.lower().endswith(".enc2") else 4
    url = _FUS_CLOUD + "?file=" + quote(path + filename, safe="/._-")
    return SamsungResolvedPackage(
        model=model,
        csc=region,
        version=server_version,
        filename=filename,
        size=size,
        url=url,
        authorization=client.cloud_authorization(),
        encryption=encryption,
        decrypt_key_hex=key.hex(),
        model_type=model_type,
    )


def resolve_version(model: str, csc: str, version: str) -> SamsungResolvedPackage:
    model = normalize_model(model)
    csc = normalize_csc(csc)
    version = normalize_version_code(version)
    client = SamsungFUSClient()
    xml = client.request(
        "NF_SmartDownloadBinaryInform.do",
        _binary_inform(version, model, csc, client.nonce),
    )
    package = _parse_binary_inform(xml, model=model, csc=csc, version=version, client=client)
    client.request(
        "NF_SmartDownloadBinaryInitForMass.do",
        _binary_init(package.filename, client.nonce, package.version, package.model_type, package.csc),
    )
    package.authorization = client.cloud_authorization()
    return package


def resolve_latest(model: str, csc: str) -> SamsungResolvedPackage:
    model = normalize_model(model)
    csc = normalize_csc(csc)
    return resolve_version(model, csc, _latest_version(model, csc))


def refresh_download_authorization(*, model: str, csc: str, version: str, expected_filename: str) -> str:
    package = resolve_version(model, csc, version)
    if package.filename != expected_filename:
        raise RuntimeError("Samsung FUS refresh resolved a different firmware package")
    return package.authorization


def decrypt_package(source: Path, *, decrypt_key_hex: str, encryption: int) -> Path:
    source = Path(source)
    if not source.is_file():
        raise FileNotFoundError(source)
    if encryption not in {2, 4}:
        raise ValueError("unsupported Samsung firmware encryption version")
    if not re.fullmatch(r"[a-fA-F0-9]{32}", str(decrypt_key_hex or "")):
        raise ValueError("Samsung decrypt key is invalid")
    if source.stat().st_size % 16:
        raise ValueError("Samsung encrypted firmware size is not AES-block aligned")
    suffix = f".enc{encryption}"
    output = source.with_name(source.name[:-len(suffix)] if source.name.lower().endswith(suffix) else source.name + ".decrypted")
    decryptor = Cipher(algorithms.AES(bytes.fromhex(decrypt_key_hex)), modes.ECB()).decryptor()
    try:
        with source.open("rb") as inf, output.open("wb") as outf:
            while chunk := inf.read(1024 * 1024):
                outf.write(decryptor.update(chunk))
            outf.write(decryptor.finalize())
        if output.stat().st_size:
            with output.open("rb+") as handle:
                handle.seek(-1, 2)
                pad = handle.read(1)[0]
                if 0 < pad <= 16 and output.stat().st_size >= pad:
                    handle.truncate(output.stat().st_size - pad)
    except Exception:
        output.unlink(missing_ok=True)
        raise
    return output
