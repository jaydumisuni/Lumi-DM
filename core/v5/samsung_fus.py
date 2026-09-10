from __future__ import annotations

import base64
from dataclasses import dataclass
import hashlib
from pathlib import Path
import re
from typing import Any
from urllib.parse import quote
import xml.etree.ElementTree as ET

from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
import requests

_FUS_META = "https://neofussvr.sslcs.cdngc.net/"
_FUS_CLOUD = "http://cloud-neofussvr.sslcs.cdngc.net/NF_DownloadBinaryForMass.do"
_FOTA = "https://fota-cloud-dn.ospserver.net/firmware"
_KEY_1 = "hqzdurufm2c8mf6bsjezu1qgveouv7c7"
_KEY_2 = "w13r4cvf4hctaujv"


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
    if len(parts) != 4 or not parts[0]:
        raise ValueError("Samsung firmware version has an invalid shape")
    if not parts[2]:
        parts[2] = parts[0]
    return "/".join(parts)


def _logic_check(value: str, nonce: str) -> str:
    if len(value) < 16:
        raise ValueError("Samsung FUS logic input is too short")
    return "".join(value[ord(character) & 0xF] for character in nonce)


def _decrypt_nonce(encoded: str) -> str:
    encrypted = base64.b64decode(encoded)
    key = _KEY_1.encode()
    decryptor = Cipher(algorithms.AES(key), modes.CBC(key[:16])).decryptor()
    padded = decryptor.update(encrypted) + decryptor.finalize()
    unpadder = padding.PKCS7(128).unpadder()
    return (unpadder.update(padded) + unpadder.finalize()).decode()


def _auth_signature(nonce: str) -> str:
    key_text = "".join(_KEY_1[ord(character) % 16] for character in nonce[:16]) + _KEY_2
    key = key_text.encode()
    padder = padding.PKCS7(128).padder()
    padded = padder.update(nonce.encode()) + padder.finalize()
    encryptor = Cipher(algorithms.AES(key), modes.CBC(key[:16])).encryptor()
    return base64.b64encode(encryptor.update(padded) + encryptor.finalize()).decode()


def _request_xml(params: dict[str, Any]) -> bytes:
    root = ET.Element("FUSMsg")
    header = ET.SubElement(root, "FUSHdr")
    ET.SubElement(header, "ProtoVer").text = "1.0"
    body = ET.SubElement(root, "FUSBody")
    put = ET.SubElement(body, "Put")
    for name, value in params.items():
        node = ET.SubElement(put, name)
        ET.SubElement(node, "Data").text = str(value)
    return ET.tostring(root)


def _binary_inform(version: str, model: str, csc: str, nonce: str) -> bytes:
    return _request_xml({
        "ACCESS_MODE": 2, "BINARY_NATURE": 1, "CLIENT_PRODUCT": "Smart Switch",
        "DEVICE_FW_VERSION": version, "DEVICE_LOCAL_CODE": csc,
        "DEVICE_MODEL_NAME": model, "LOGIC_CHECK": _logic_check(version, nonce),
    })


def _binary_init(filename: str, nonce: str) -> bytes:
    check_input = filename.split(".")[0][-16:]
    return _request_xml({"BINARY_FILE_NAME": filename, "LOGIC_CHECK": _logic_check(check_input, nonce)})


def _text(root: ET.Element, path: str) -> str:
    value = root.findtext(path)
    return str(value or "").strip()


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

    def request_envelope(self) -> dict[str, Any]:
        value = {
            "url": self.url, "provider_id": "samsung-fus",
            "suggested_filename": self.filename,
            "headers": {"Authorization": self.authorization, "User-Agent": "Kies2.0_FUS"},
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
        self.request("NF_DownloadGenerateNonce.do")

    def _authorization(self, *, cloud: bool = False) -> str:
        nonce = self.encnonce if cloud else ""
        return f'FUS nonce="{nonce}", signature="{self.auth}", nc="", type="", realm="", newauth="1"'

    def request(self, path: str, data: bytes | str = b"") -> str:
        response = self.session.post(
            _FUS_META + path, data=data,
            headers={"Authorization": self._authorization(), "User-Agent": "Kies2.0_FUS"},
            timeout=(10, 30),
        )
        response.raise_for_status()
        encoded = response.headers.get("NONCE")
        if encoded:
            self.encnonce = encoded
            self.nonce = _decrypt_nonce(encoded)
            self.auth = _auth_signature(self.nonce)
        return response.text

    def cloud_authorization(self) -> str:
        if not self.encnonce or not self.auth:
            raise RuntimeError("Samsung FUS session did not establish cloud authorization")
        return self._authorization(cloud=True)


def _latest_version(model: str, csc: str, *, session: requests.Session | None = None) -> str:
    active = session or requests.Session()
    response = active.get(f"{_FOTA}/{quote(csc)}/{quote(model)}/version.xml", headers={"User-Agent": "Lumi-DM-Firmware/1.0"}, timeout=(10, 30))
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
    status = int(_text(root, "./FUSBody/Results/Status") or 0)
    if status != 200:
        raise RuntimeError(f"Samsung FUS BinaryInform returned status {status}")
    filename = _text(root, "./FUSBody/Put/BINARY_NAME/Data")
    path = _text(root, "./FUSBody/Put/MODEL_PATH/Data")
    size = int(_text(root, "./FUSBody/Put/BINARY_BYTE_SIZE/Data") or 0)
    if not filename or not path or size <= 0:
        raise RuntimeError("Samsung FUS returned incomplete package metadata")
    encryption = 2 if filename.lower().endswith(".enc2") else 4
    if encryption == 2:
        key = hashlib.md5(f"{csc}:{model}:{version}".encode()).digest()
    else:
        fw_version = _text(root, "./FUSBody/Results/LATEST_FW_VERSION/Data") or version
        logic_value = _text(root, "./FUSBody/Put/LOGIC_VALUE_FACTORY/Data")
        if not logic_value:
            raise RuntimeError("Samsung FUS did not provide the decrypt-key logic value")
        key = hashlib.md5(_logic_check(fw_version, logic_value).encode()).digest()
    url = _FUS_CLOUD + "?file=" + quote(path + filename, safe="/._-")
    return SamsungResolvedPackage(
        model=model, csc=csc, version=version, filename=filename, size=size, url=url,
        authorization=client.cloud_authorization(), encryption=encryption, decrypt_key_hex=key.hex(),
    )


def resolve_latest(model: str, csc: str) -> SamsungResolvedPackage:
    model = normalize_model(model)
    csc = normalize_csc(csc)
    version = _latest_version(model, csc)
    client = SamsungFUSClient()
    xml = client.request("NF_DownloadBinaryInform.do", _binary_inform(version, model, csc, client.nonce))
    package = _parse_binary_inform(xml, model=model, csc=csc, version=version, client=client)
    client.request("NF_DownloadBinaryInitForMass.do", _binary_init(package.filename, client.nonce))
    package.authorization = client.cloud_authorization()
    return package


def decrypt_package(source: Path, *, decrypt_key_hex: str, encryption: int) -> Path:
    source = Path(source)
    if not source.is_file():
        raise FileNotFoundError(source)
    if encryption not in {2, 4}:
        raise ValueError("unsupported Samsung firmware encryption version")
    if not re.fullmatch(r"[a-fA-F0-9]{32}", str(decrypt_key_hex or "")):
        raise ValueError("Samsung decrypt key is invalid")
    suffix = f".enc{encryption}"
    output = source.with_name(source.name[:-len(suffix)] if source.name.lower().endswith(suffix) else source.name + ".decrypted")
    decryptor = Cipher(algorithms.AES(bytes.fromhex(decrypt_key_hex)), modes.ECB()).decryptor()
    unpadder = padding.PKCS7(128).unpadder()
    try:
        with source.open("rb") as inf, output.open("wb") as outf:
            while chunk := inf.read(1024 * 1024):
                outf.write(unpadder.update(decryptor.update(chunk)))
            outf.write(unpadder.update(decryptor.finalize()))
            outf.write(unpadder.finalize())
    except Exception:
        output.unlink(missing_ok=True)
        raise
    return output
