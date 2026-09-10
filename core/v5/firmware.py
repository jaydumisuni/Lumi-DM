"""Deterministic firmware discovery for technicians.

The catalogue never guesses a firmware match. Provider adapters return evidence
from public official/community sources, and every result keeps its original source
URL so a technician can inspect or copy it before staging the download in Lumi.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import csv
import io
import json
from pathlib import Path
import re
import shutil
import subprocess
import threading
import time
from typing import Any, Callable
from urllib.parse import quote_plus, unquote, urljoin

from bs4 import BeautifulSoup
import requests


_USER_AGENT = "Lumi-DM-Firmware/1.0 (+https://github.com/jaydumisuni/lumi-dm)"
_TIMEOUT = (8, 20)


@dataclass(slots=True)
class FirmwareProvider:
    id: str
    name: str
    group: str
    brands: list[str]
    description: str
    official: bool
    direct_files: bool
    channels: list[str] = field(default_factory=lambda: ["stable"])
    homepage: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class FirmwareDevice:
    id: str
    name: str
    brand: str
    provider: str
    model: str = ""
    codename: str = ""
    supported: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(slots=True)
class FirmwareResult:
    id: str
    provider: str
    source_name: str
    source_group: str
    official: bool
    brand: str
    device: str
    title: str
    version: str = ""
    build: str = ""
    channel: str = "stable"
    file_type: str = "firmware"
    url: str = ""
    source_url: str = ""
    filename: str = ""
    size: int = 0
    sha256: str = ""
    signed: bool | None = None
    release_date: str = ""
    notes: str = ""
    direct: bool = True
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class _TTLCache:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._values: dict[str, tuple[float, Any]] = {}

    def get(self, key: str, ttl: float, loader: Callable[[], Any]) -> Any:
        now = time.monotonic()
        with self._lock:
            value = self._values.get(key)
            if value and now - value[0] <= ttl:
                return value[1]
        loaded = loader()
        with self._lock:
            self._values[key] = (now, loaded)
        return loaded


_CACHE = _TTLCache()


def _session() -> requests.Session:
    session = requests.Session()
    session.trust_env = False
    session.headers.update({"User-Agent": _USER_AGENT, "Accept": "application/json,text/html;q=0.9,*/*;q=0.8"})
    return session


def _get_json(url: str) -> Any:
    with _session() as session:
        response = session.get(url, timeout=_TIMEOUT)
        response.raise_for_status()
        return response.json()


def _get_text(url: str) -> str:
    with _session() as session:
        response = session.get(url, timeout=_TIMEOUT)
        response.raise_for_status()
        return response.text


def _date(value: Any) -> str:
    if value in (None, ""):
        return ""
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(float(value), timezone.utc).date().isoformat()
        except (OSError, OverflowError, ValueError):
            return ""
    text = str(value)
    return text[:10] if re.match(r"^\d{4}-\d{2}-\d{2}", text) else text


def _safe_id(*parts: str) -> str:
    raw = "-".join(str(part or "") for part in parts).lower()
    return re.sub(r"[^a-z0-9._-]+", "-", raw).strip("-")[:240]


_PROVIDERS = [
    FirmwareProvider(
        id="samsung-fus",
        name="Samsung FUS resolver",
        group="Official Samsung firmware resolver",
        brands=["Samsung"],
        description="Resolves Samsung-hosted firmware through Lumi's native FUS adapter; Lumi owns authentication, resumable transfer and decryption.",
        official=False,
        direct_files=False,
        channels=["stable", "all"],
        homepage="https://www.samsung.com/support/",
    ),
    FirmwareProvider(
        id="xiaomi-firmware-updater",
        name="Xiaomi Firmware Updater",
        group="Verified community firmware index",
        brands=["Xiaomi", "Redmi", "POCO"],
        description="Community-maintained firmware extracts; Lumi shows a direct artifact only when GitHub publishes a SHA-256 digest for that exact release asset.",
        official=False,
        direct_files=True,
        channels=["stable", "all"],
        homepage="https://github.com/XiaomiFirmwareUpdater",
    ),
    FirmwareProvider(
        id="apple-ipsw",
        name="Apple IPSW / OTA",
        group="Official OS",
        brands=["Apple"],
        description="Signed and unsigned Apple restore images and OTA packages indexed by IPSW.me.",
        official=False,
        direct_files=True,
        channels=["stable", "beta", "all"],
        homepage="https://ipsw.me",
    ),
    FirmwareProvider(
        id="google-pixel",
        name="Google Pixel Factory / OTA",
        group="Official OS",
        brands=["Google Pixel"],
        description="Factory images, full OTA packages and public Android preview builds from Google.",
        official=True,
        direct_files=True,
        channels=["stable", "beta", "all"],
        homepage="https://developers.google.com/android/images",
    ),
    FirmwareProvider(
        id="lineageos",
        name="LineageOS",
        group="Custom OS",
        brands=["Android"],
        description="Official LineageOS device builds and recovery images.",
        official=True,
        direct_files=True,
        channels=["stable", "nightly", "all"],
        homepage="https://download.lineageos.org",
    ),
    FirmwareProvider(
        id="grapheneos",
        name="GrapheneOS",
        group="Custom OS",
        brands=["Google Pixel"],
        description="Official GrapheneOS factory images and full update packages.",
        official=True,
        direct_files=True,
        channels=["stable", "beta", "all"],
        homepage="https://grapheneos.org/releases",
    ),
    FirmwareProvider(
        id="eos",
        name="/e/OS",
        group="Custom OS",
        brands=["Android"],
        description="Supported-device selector, installation guides and official/community /e/OS builds.",
        official=True,
        direct_files=False,
        channels=["official", "community", "all"],
        homepage="https://wiki.e.foundation/devices",
    ),
    FirmwareProvider(
        id="androidfilehost",
        name="AndroidFileHost",
        group="Community mirrors",
        brands=["Android"],
        description="Community-hosted firmware, recoveries, kernels and custom ROM packages.",
        official=False,
        direct_files=False,
        channels=["all"],
        homepage="https://androidfilehost.com",
    ),
    FirmwareProvider(
        id="needrom",
        name="Needrom",
        group="Community mirrors",
        brands=["Android"],
        description="Community firmware and ROM listings. Technician verification is required.",
        official=False,
        direct_files=False,
        channels=["all"],
        homepage="https://www.needrom.com",
    ),
    FirmwareProvider(
        id="xda",
        name="XDA Forums",
        group="Community knowledge",
        brands=["Android"],
        description="Device forums, maintainer threads, ROM releases and installation evidence.",
        official=False,
        direct_files=False,
        channels=["all"],
        homepage="https://xdaforums.com",
    ),
]


_BRANDS = [
    "Apple", "Samsung", "Google Pixel", "Xiaomi", "Redmi", "POCO",
    "OnePlus", "Oppo", "Realme", "Vivo", "Motorola", "Huawei", "Honor",
    "Tecno", "Infinix", "itel", "Nothing", "Sony", "Asus", "Nokia / HMD",
    "ZTE / Nubia", "Lenovo", "LG", "Meizu", "Android",
]


_PIXEL_DEVICES = [
    ("oriole", "Pixel 6"), ("raven", "Pixel 6 Pro"), ("bluejay", "Pixel 6a"),
    ("panther", "Pixel 7"), ("cheetah", "Pixel 7 Pro"), ("lynx", "Pixel 7a"),
    ("tangorpro", "Pixel Tablet"), ("felix", "Pixel Fold"),
    ("shiba", "Pixel 8"), ("husky", "Pixel 8 Pro"), ("akita", "Pixel 8a"),
    ("tokay", "Pixel 9"), ("caiman", "Pixel 9 Pro"),
    ("komodo", "Pixel 9 Pro XL"), ("comet", "Pixel 9 Pro Fold"),
    ("tegu", "Pixel 9a"), ("frankel", "Pixel 10"),
    ("blazer", "Pixel 10 Pro"), ("mustang", "Pixel 10 Pro XL"),
    ("rango", "Pixel 10 Pro Fold"), ("stallion", "Pixel 10a"),
]


_BRAND_PREFIXES = [
    (("google", "pixel"), "Google Pixel"),
    (("samsung",), "Samsung"),
    (("tecno",), "Tecno"),
    (("infinix",), "Infinix"),
    (("itel",), "itel"),
    (("huawei",), "Huawei"),
    (("honor",), "Honor"),
    (("xiaomi",), "Xiaomi"),
    (("redmi",), "Redmi"),
    (("poco",), "POCO"),
    (("oneplus",), "OnePlus"),
    (("oppo",), "Oppo"),
    (("realme",), "Realme"),
    (("vivo",), "Vivo"),
    (("motorola", "moto"), "Motorola"),
    (("nothing",), "Nothing"),
    (("sony",), "Sony"),
    (("asus",), "Asus"),
    (("nokia", "hmd"), "Nokia / HMD"),
    (("zte", "nubia", "redmagic"), "ZTE / Nubia"),
    (("lenovo",), "Lenovo"),
    (("lg", "lge"), "LG"),
    (("meizu",), "Meizu"),
]


def _canonical_brand(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    key = re.sub(r"[^a-z0-9]+", " ", raw.lower()).strip()
    words = set(key.split())
    for aliases, canonical in _BRAND_PREFIXES:
        if any(key == alias or key.startswith(alias + " ") or alias in words for alias in aliases):
            return canonical
    if key == "android":
        return "Android"
    return raw if raw in _BRANDS else ""


def _parse_google_play_device_index(text: str) -> dict[str, list[FirmwareDevice]]:
    index: dict[str, list[FirmwareDevice]] = {}
    seen: set[tuple[str, str, str]] = set()
    reader = csv.DictReader(io.StringIO(str(text or "").lstrip("\ufeff")))
    for row in reader:
        brand = _canonical_brand(row.get("Retail Branding", ""))
        if brand not in _BRANDS or brand == "Apple":
            continue
        name = str(row.get("Marketing Name") or "").strip()
        codename = str(row.get("Device") or "").strip()
        model = str(row.get("Model") or "").strip()
        item_id = model or codename or name
        if not item_id:
            continue
        identity = (brand.lower(), item_id.lower(), codename.lower())
        if identity in seen:
            continue
        seen.add(identity)
        index.setdefault(brand, []).append(FirmwareDevice(
            id=item_id,
            name=name or model or codename,
            brand=brand,
            provider="google-play-catalog",
            model=model,
            codename=codename,
            supported=True,
            metadata={
                "identity_source": "Google Play supported devices",
                "play_protect_certified": True,
                "retail_brand": str(row.get("Retail Branding") or "").strip(),
                "identity_only": True,
            },
        ))
    for values in index.values():
        values.sort(key=lambda item: (item.name.lower(), item.model.lower(), item.codename.lower()))
    return index


def _google_play_device_index() -> dict[str, list[FirmwareDevice]]:
    return _CACHE.get(
        "google-play-device-index",
        24 * 60 * 60,
        lambda: _parse_google_play_device_index(_get_text("https://storage.googleapis.com/play_public/supported_devices.csv")),
    )


def _parse_lineage_device_index(text: str) -> dict[str, list[FirmwareDevice]]:
    source = str(text or "")
    base = source.find("DEVICES = JSON.parse")
    marker = "decodeURIComponent('"
    start = source.find(marker, max(base, 0))
    if base < 0 or start < 0:
        raise ValueError("LineageOS device data was not found")
    start += len(marker)
    end = source.find("'.replaceAll", start)
    if end < 0:
        raise ValueError("LineageOS device data terminator was not found")
    encoded = source[start:end].replace("+", " ")
    raw = json.loads(unquote(encoded))
    if not isinstance(raw, dict):
        raise ValueError("LineageOS device data is not an object")
    index: dict[str, list[FirmwareDevice]] = {}
    seen: set[tuple[str, str, str]] = set()
    for key, metadata in raw.items():
        if not isinstance(metadata, dict):
            continue
        brand = _canonical_brand(str(metadata.get("vendor") or ""))
        if brand not in _BRANDS or brand == "Apple":
            continue
        codename = str(metadata.get("codename") or str(key).split("_variant", 1)[0]).strip()
        name = str(metadata.get("name") or codename).strip()
        models = [str(value).strip() for value in (metadata.get("models") or []) if str(value).strip()]
        identity = (brand.lower(), codename.lower(), name.lower())
        if not codename or identity in seen:
            continue
        seen.add(identity)
        maintainers = metadata.get("maintainers") if isinstance(metadata.get("maintainers"), list) else []
        index.setdefault(brand, []).append(FirmwareDevice(
            id=codename,
            name=name,
            brand=brand,
            provider="lineageos",
            model=models[0] if models else "",
            codename=codename,
            supported=bool(maintainers),
            metadata={
                "models": models,
                "maintainers": maintainers,
                "current_branch": metadata.get("current_branch"),
                "identity_source": "LineageOS Wiki",
                "lineage_url": f"https://wiki.lineageos.org/devices/{quote_plus(codename)}/",
            },
        ))
    for values in index.values():
        values.sort(key=lambda item: (item.name.lower(), item.codename.lower()))
    return index


def _lineage_device_index() -> dict[str, list[FirmwareDevice]]:
    return _CACHE.get(
        "lineage-device-index-v2",
        12 * 60 * 60,
        lambda: _parse_lineage_device_index(_get_text("https://wiki.lineageos.org/devices/")),
    )


def providers() -> list[dict[str, Any]]:
    return [provider.to_dict() for provider in _PROVIDERS]


def brands() -> list[str]:
    return list(_BRANDS)


def _apple_devices() -> list[FirmwareDevice]:
    def load() -> list[FirmwareDevice]:
        raw = _get_json("https://api.ipsw.me/v4/devices")
        return [
            FirmwareDevice(
                id=str(item.get("identifier") or ""),
                name=str(item.get("name") or item.get("identifier") or "Apple device"),
                brand="Apple",
                provider="apple-ipsw",
                model=str(item.get("model") or ""),
                codename=str(item.get("identifier") or ""),
                metadata={"boardconfig": item.get("boardconfig"), "platform": item.get("platform")},
            )
            for item in list(raw or [])
            if item.get("identifier")
        ]

    return _CACHE.get("apple-devices", 12 * 60 * 60, load)


def _lineage_devices() -> list[FirmwareDevice]:
    return [item for values in _lineage_device_index().values() for item in values]


def list_devices(provider: str = "", query: str = "", brand: str = "") -> list[dict[str, Any]]:
    query_lower = query.strip().lower()
    requested_brand = _canonical_brand(brand) if brand else ""
    values: list[FirmwareDevice] = []

    try:
        if provider in {"", "apple-ipsw"} and requested_brand in {"", "Apple"}:
            values.extend(_apple_devices())
    except Exception:
        pass

    if provider in {"", "google-pixel", "grapheneos"} and requested_brand in {"", "Google Pixel"}:
        values.extend([
            FirmwareDevice(
                id=codename, name=name, brand="Google Pixel", provider="google-pixel",
                model=name, codename=codename,
            )
            for codename, name in _PIXEL_DEVICES
        ])

    if provider in {"", "google-play-catalog"} and requested_brand != "Apple":
        try:
            play_index = _google_play_device_index()
            if requested_brand:
                values.extend(play_index.get(requested_brand, []))
            else:
                values.extend(item for group in play_index.values() for item in group)
        except Exception:
            pass

    if provider in {"", "lineageos"} and requested_brand != "Apple":
        try:
            lineage_index = _lineage_device_index()
            if requested_brand:
                values.extend(lineage_index.get(requested_brand, []))
            else:
                values.extend(item for group in lineage_index.values() for item in group)
        except Exception:
            pass

    dedup: dict[tuple[str, str, str], FirmwareDevice] = {}
    for item in values:
        if requested_brand and item.brand != requested_brand:
            continue
        model_aliases = " ".join(str(value) for value in (item.metadata.get("models") or [])) if isinstance(item.metadata, dict) else ""
        searchable = " ".join([item.name, item.id, item.model, item.codename, item.brand, model_aliases]).lower()
        if query_lower and query_lower not in searchable:
            continue
        key = (item.provider, item.id.lower(), item.codename.lower())
        dedup[key] = item
    ordered = sorted(dedup.values(), key=lambda value: (value.brand.lower(), value.name.lower(), value.model.lower(), value.provider))
    limit = 5000 if requested_brand else 5000
    return [item.to_dict() for item in ordered[:limit]]


def _apple_firmware(device: str, channel: str) -> list[FirmwareResult]:
    result: list[FirmwareResult] = []
    kinds = ["ipsw", "ota"] if channel in {"", "all", "beta"} else ["ipsw"]
    for kind in kinds:
        try:
            raw = _get_json(f"https://api.ipsw.me/v4/{kind}/device/{quote_plus(device)}")
        except Exception:
            continue
        values = raw.get("firmwares", raw) if isinstance(raw, dict) else raw
        for item in list(values or []):
            beta = bool(item.get("beta")) or "beta" in str(item.get("version") or "").lower()
            item_channel = "beta" if beta else "stable"
            if channel not in {"", "all"} and channel != item_channel:
                continue
            url = str(item.get("url") or "")
            build = str(item.get("buildid") or item.get("build") or "")
            version = str(item.get("version") or "")
            filename = url.rsplit("/", 1)[-1].split("?", 1)[0] if url else ""
            result.append(FirmwareResult(
                id=_safe_id("apple", device, kind, build or version),
                provider="apple-ipsw",
                source_name="IPSW.me",
                source_group="Official OS index",
                official=False,
                brand="Apple",
                device=device,
                title=f"{version or build} {kind.upper()}",
                version=version,
                build=build,
                channel=item_channel,
                file_type=kind,
                url=url,
                source_url=f"https://ipsw.me/{kind}/{device}",
                filename=filename,
                size=int(item.get("filesize") or 0),
                sha256=str(item.get("sha256sum") or item.get("sha256") or ""),
                signed=bool(item.get("signed")) if "signed" in item else None,
                release_date=_date(item.get("releasedate") or item.get("uploaddate")),
                notes="Signing state is reported by the source and should be checked again before flashing.",
                direct=bool(url),
                metadata={"identifier": device, "kind": kind, "md5": item.get("md5sum")},
            ))
    return result


def _parse_google_page(url: str, device: str, channel: str, file_type: str) -> list[FirmwareResult]:
    html = _CACHE.get(f"google-page:{url}", 60 * 60, lambda: _get_text(url))
    soup = BeautifulSoup(html, "html.parser")
    query = device.strip().lower()
    results: list[FirmwareResult] = []
    for link in soup.select("a[href]"):
        href = urljoin(url, str(link.get("href") or ""))
        if not re.search(r"\.(?:zip|tgz)(?:\?|$)", href, re.I):
            continue
        parent = link.find_parent("tr") or link.parent
        text = " ".join(parent.stripped_strings) if parent else link.get_text(" ", strip=True)
        filename = href.rsplit("/", 1)[-1].split("?", 1)[0]
        searchable = f"{text} {filename}".lower()
        if query and query not in searchable:
            codename = next((code for code, name in _PIXEL_DEVICES if query in {code.lower(), name.lower()}), "")
            if not codename or codename.lower() not in searchable:
                continue
        checksum_match = re.search(r"\b[a-f0-9]{64}\b", text, re.I)
        build_match = re.search(r"\b[A-Z]{1,4}\d{1,3}[A-Z]?\.\d{6}\.\d{3}(?:\.[A-Z0-9]+)?\b", text)
        model = next((name for code, name in _PIXEL_DEVICES if code in filename.lower()), device or "Google Pixel")
        results.append(FirmwareResult(
            id=_safe_id("google", filename),
            provider="google-pixel",
            source_name="Google Developers",
            source_group="Official OS",
            official=True,
            brand="Google Pixel",
            device=model,
            title=f"{model} {file_type}",
            version="",
            build=build_match.group(0) if build_match else "",
            channel=channel,
            file_type=file_type,
            url=href,
            source_url=url,
            filename=filename,
            sha256=checksum_match.group(0).lower() if checksum_match else "",
            release_date="",
            notes=text[:500],
            direct=True,
        ))
    return results


def _google_firmware(device: str, channel: str) -> list[FirmwareResult]:
    results: list[FirmwareResult] = []
    if channel in {"", "stable", "all"}:
        for url, kind in [
            ("https://developers.google.com/android/images", "factory image"),
            ("https://developers.google.com/android/ota", "full OTA"),
        ]:
            try:
                results.extend(_parse_google_page(url, device, "stable", kind))
            except Exception:
                continue
    if channel in {"beta", "all"}:
        for url in [
            "https://developer.android.com/about/versions/17/download",
            "https://developer.android.com/about/versions/17/qpr1/download",
            "https://developer.android.com/about/versions/17/qpr2/download",
        ]:
            try:
                results.extend(_parse_google_page(url, device, "beta", "preview factory image"))
            except Exception:
                continue
    return results


def _parse_lineage_builds(raw: Any, device: str, channel: str) -> list[FirmwareResult]:
    builds = raw.get("response", raw.get("builds", [])) if isinstance(raw, dict) else raw
    results: list[FirmwareResult] = []
    for build in list(builds or []):
        if not isinstance(build, dict):
            continue
        build_type = str(build.get("type") or build.get("build_type") or "nightly").lower()
        item_channel = "nightly" if "night" in build_type else "stable"
        if channel not in {"", "all"} and channel != item_channel:
            continue
        version = str(build.get("version") or "")
        release_date = _date(build.get("date") or build.get("datetime"))
        for file_item in list(build.get("files") or []):
            if not isinstance(file_item, dict):
                continue
            url = str(file_item.get("url") or file_item.get("download_url") or "")
            filename = str(file_item.get("filename") or (url.rsplit("/", 1)[-1] if url else ""))
            sha256 = str(file_item.get("sha256") or "").lower()
            lower = filename.lower()
            if not (lower.endswith(".zip") or lower.endswith(".img")):
                continue
            if not url.startswith("https://") or not re.fullmatch(r"[a-f0-9]{64}", sha256):
                continue
            if lower.endswith(".zip"):
                file_type = "ROM"
            elif lower == "recovery.img":
                file_type = "recovery image"
            else:
                file_type = f"{Path(filename).stem} image"
            results.append(FirmwareResult(
                id=_safe_id("lineage", device, release_date, filename),
                provider="lineageos",
                source_name="LineageOS",
                source_group="Custom OS",
                official=True,
                brand="Android",
                device=device,
                title=f"LineageOS {version} {filename}",
                version=version,
                build=str(build.get("datetime") or release_date),
                channel=item_channel,
                file_type=file_type,
                url=url,
                source_url=f"https://download.lineageos.org/devices/{quote_plus(device)}/builds",
                filename=filename,
                size=int(file_item.get("size") or 0),
                sha256=sha256,
                signed=True if lower.endswith("-signed.zip") else None,
                release_date=release_date,
                notes="Official LineageOS build artifact with published SHA-256. Read the device installation guide before flashing.",
                direct=True,
                metadata={
                    "build_type": build_type,
                    "sha1": str(file_item.get("sha1") or ""),
                    "os_patch_level": file_item.get("os_patch_level"),
                    "os_sdk_level": file_item.get("os_sdk_level"),
                    "lineage_verified": True,
                },
            ))
    return results


def _lineage_firmware(device: str, channel: str) -> list[FirmwareResult]:
    raw = _get_json(f"https://download.lineageos.org/api/v2/devices/{quote_plus(device)}/builds")
    return _parse_lineage_builds(raw, device, channel)


def _graphene_firmware(device: str, channel: str) -> list[FirmwareResult]:
    url = "https://grapheneos.org/releases"
    html = _CACHE.get("graphene-releases", 60 * 60, lambda: _get_text(url))
    soup = BeautifulSoup(html, "html.parser")
    query = device.strip().lower()
    results: list[FirmwareResult] = []
    for link in soup.select("a[href]"):
        href = urljoin(url, str(link.get("href") or ""))
        if not re.search(r"\.(?:zip|tar\.gz)(?:\?|$)", href, re.I):
            continue
        filename = href.rsplit("/", 1)[-1].split("?", 1)[0]
        context = " ".join((link.find_parent(["li", "p", "tr", "section"]) or link.parent).stripped_strings)
        searchable = f"{filename} {context}".lower()
        if query and query not in searchable:
            codename = next((code for code, name in _PIXEL_DEVICES if query in {code.lower(), name.lower()}), "")
            if not codename or codename not in searchable:
                continue
        beta = "beta" in searchable or "alpha" in searchable
        item_channel = "beta" if beta else "stable"
        if channel not in {"", "all"} and channel != item_channel:
            continue
        model = next((name for code, name in _PIXEL_DEVICES if code in searchable), device or "Google Pixel")
        results.append(FirmwareResult(
            id=_safe_id("graphene", filename),
            provider="grapheneos",
            source_name="GrapheneOS",
            source_group="Custom OS",
            official=True,
            brand="Google Pixel",
            device=model,
            title=f"GrapheneOS {model}",
            channel=item_channel,
            file_type="factory/update package",
            url=href,
            source_url=url,
            filename=filename,
            notes=context[:500],
            direct=True,
        ))
    return results


def _xfu_repo_name(codename: str) -> str:
    value = str(codename or "").strip()
    if not re.fullmatch(r"[a-z][a-z0-9_-]{1,30}", value):
        return ""
    return f"firmware_xiaomi_{value}"


def _resolve_device_codename(brand: str, device: str) -> str:
    requested = _canonical_brand(brand)
    needle = str(device or "").strip().lower()
    if not requested or not needle:
        return ""
    try:
        values = _google_play_device_index().get(requested, [])
    except Exception:
        values = []
    for item in values:
        aliases = [item.id, item.name, item.model, item.codename]
        if any(str(value or "").strip().lower() == needle for value in aliases):
            candidate = str(item.codename or "").strip().lower()
            if _xfu_repo_name(candidate):
                return candidate
    if _xfu_repo_name(needle):
        return needle
    return ""


def _parse_xfu_release(release: dict[str, Any], *, brand: str, device: str, codename: str) -> list[FirmwareResult]:
    results: list[FirmwareResult] = []
    published = _date(release.get("published_at") or release.get("created_at"))
    body = str(release.get("body") or "")
    tag = str(release.get("tag_name") or release.get("name") or "")
    version_match = re.search(r"\b(?:OS|V)?([0-9]+(?:\.[0-9A-Z]+){2,}(?:\.[A-Z0-9]+)?)\b", f"{body} {tag}", re.I)
    version = version_match.group(0) if version_match else tag
    source_url = str(release.get("html_url") or "")
    for asset in list(release.get("assets") or []):
        if not isinstance(asset, dict):
            continue
        filename = str(asset.get("name") or "")
        url = str(asset.get("browser_download_url") or "")
        digest = str(asset.get("digest") or "").strip().lower()
        if not filename.lower().endswith(".zip") or not url.startswith("https://github.com/"):
            continue
        if not digest.startswith("sha256:"):
            continue
        sha256 = digest.split(":", 1)[1]
        if not re.fullmatch(r"[a-f0-9]{64}", sha256):
            continue
        asset_version_match = re.search(r"\b(OS[0-9]+(?:\.[0-9A-Z]+){2,})\b", filename, re.I)
        asset_version = asset_version_match.group(1).upper() if asset_version_match else version
        lower_name = filename.lower()
        if "_eea_global-" in lower_name:
            region = "EEA"
        elif "_in_global-" in lower_name or "_india" in lower_name:
            region = "India"
        elif "_global-" in lower_name or "global_" in lower_name:
            region = "Global"
        elif "_cn" in lower_name or "china" in lower_name:
            region = "China"
        else:
            region = "Unknown"
        results.append(FirmwareResult(
            id=_safe_id("xfu", codename, tag, filename),
            provider="xiaomi-firmware-updater",
            source_name="Xiaomi Firmware Updater",
            source_group="Verified community firmware index",
            official=False,
            brand=_canonical_brand(brand) or brand,
            device=device or codename,
            title=f"{device or codename} firmware {asset_version}",
            version=asset_version,
            build=tag,
            channel="stable",
            file_type="firmware extract",
            url=url,
            source_url=source_url or url,
            filename=filename,
            size=int(asset.get("size") or 0),
            sha256=sha256,
            release_date=published,
            notes="Community-maintained firmware extract. The exact GitHub release asset carries a SHA-256 digest; verify model/region before flashing.",
            direct=True,
            metadata={
                "codename": codename,
                "region": region,
                "community_index": True,
                "artifact_claim": "extracted from official MIUI/HyperOS ROM",
                "github_digest": digest,
            },
        ))
    return results


def _github_release_json(url: str) -> Any:
    try:
        session = requests.Session()
        session.headers.update({
            "User-Agent": _USER_AGENT,
            "Accept": "application/vnd.github+json",
        })
        response = session.get(url, timeout=_TIMEOUT)
        response.raise_for_status()
        return response.json()
    except Exception as primary:
        curl = shutil.which("curl")
        if not curl:
            raise primary
        completed = subprocess.run(
            [curl, "-fsSL", "--connect-timeout", "10", "--max-time", "45",
             "-H", "Accept: application/vnd.github+json",
             "-H", f"User-Agent: {_USER_AGENT}", url],
            capture_output=True, text=True, timeout=50, check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError((completed.stderr or str(primary))[-1000:]) from primary
        return json.loads(completed.stdout)


def _xiaomi_firmware(brand: str, device: str, channel: str) -> list[FirmwareResult]:
    if channel not in {"", "all", "stable", "official", "community"}:
        return []
    codename = _resolve_device_codename(brand, device)
    repo = _xfu_repo_name(codename)
    if not repo:
        return []
    release = _github_release_json(f"https://api.github.com/repos/XiaomiFirmwareUpdaterReleases/{repo}/releases/latest")
    if not isinstance(release, dict):
        return []
    return _parse_xfu_release(release, brand=brand, device=device, codename=codename)


def _search_sources(brand: str, device: str, query: str, provider: str = "") -> list[FirmwareResult]:
    phrase = " ".join(part for part in [brand, device, query, "firmware ROM"] if part).strip()
    encoded = quote_plus(phrase)
    sources = [
        ("androidfilehost", "AndroidFileHost", "Community mirrors", f"https://androidfilehost.com/?w=search&s={encoded}"),
        ("needrom", "Needrom", "Community mirrors", f"https://www.needrom.com/?s={encoded}"),
        ("xda", "XDA Forums", "Community knowledge", f"https://xdaforums.com/search/?q={encoded}"),
        ("eos", "/e/OS device selector", "Custom OS", f"https://wiki.e.foundation/devices?query={quote_plus(device or brand)}"),
    ]
    if brand.lower() in {"samsung"}:
        sources.insert(0, ("samsung-support", "Samsung Support / Smart Switch", "Official OS", "https://www.samsung.com/support/"))
    if brand.lower() in {"xiaomi", "redmi", "poco"}:
        sources.insert(0, ("xiaomi-support", "Xiaomi Support / HyperOS", "Official OS", "https://www.mi.com/global/support/"))
    results: list[FirmwareResult] = []
    for source_id, name, group, url in sources:
        if provider and provider not in {source_id, "all"}:
            continue
        results.append(FirmwareResult(
            id=_safe_id(source_id, phrase),
            provider=source_id,
            source_name=name,
            source_group=group,
            official=group == "Official OS",
            brand=brand or "Android",
            device=device or query or "Device search",
            title=f"Search {name} for {device or query or brand}",
            channel="all",
            file_type="source search",
            url=url,
            source_url=url,
            filename="",
            notes="This source requires technician review before download. Confirm model, region, bootloader and partition requirements.",
            direct=False,
            metadata={"query": phrase},
        ))
    return results


def search_firmware(
    *,
    provider: str = "all",
    brand: str = "",
    device: str = "",
    query: str = "",
    channel: str = "all",
    include_community: bool = True,
) -> list[dict[str, Any]]:
    results: list[FirmwareResult] = []
    selected = provider or "all"
    if selected in {"all", "apple-ipsw"} and (brand.lower() == "apple" or selected == "apple-ipsw") and device:
        try:
            results.extend(_apple_firmware(device, channel))
        except Exception:
            pass
    if selected in {"all", "google-pixel"} and ("pixel" in brand.lower() or selected == "google-pixel"):
        try:
            results.extend(_google_firmware(device or query, channel))
        except Exception:
            pass
    if selected in {"all", "lineageos"} and device:
        try:
            results.extend(_lineage_firmware(device, channel))
        except Exception:
            pass
    if selected in {"all", "grapheneos"} and ("pixel" in brand.lower() or selected == "grapheneos"):
        try:
            results.extend(_graphene_firmware(device or query, channel))
        except Exception:
            pass
    if selected in {"all", "samsung-fus"} and brand.lower() == "samsung" and device:
        results.append(FirmwareResult(
            id=_safe_id("samsung-fus", device), provider="samsung-fus",
            source_name="Samsung FUS · Lumi native resolver",
            source_group="Official Samsung firmware resolver", official=False,
            brand="Samsung", device=device, title=f"Resolve latest Samsung firmware for {device}",
            channel="stable", file_type="official firmware resolver",
            url="", source_url="https://www.samsung.com/support/",
            notes="Requires exact 3-character Samsung CSC. Lumi negotiates Samsung FUS natively, keeps session authentication in its encrypted vault, and owns the download/decrypt lifecycle.",
            direct=False, metadata={"resolver": "samsung-fus", "model": device},
        ))
    if (include_community or selected == "xiaomi-firmware-updater") and _canonical_brand(brand) in {"Xiaomi", "Redmi", "POCO"} and device:
        try:
            results.extend(_xiaomi_firmware(brand, device, channel))
        except Exception:
            pass
    if include_community or selected in {"androidfilehost", "needrom", "xda", "eos"}:
        results.extend(_search_sources(brand, device, query, selected))

    needle = query.strip().lower()
    if needle:
        results = [
            item for item in results
            if needle in " ".join([
                item.title, item.version, item.build, item.filename, item.device,
                item.source_name, item.notes,
            ]).lower()
            or item.file_type == "source search"
        ]
    dedup: dict[str, FirmwareResult] = {}
    for item in results:
        dedup[item.id] = item
    ordered = sorted(
        dedup.values(),
        key=lambda item: (
            0 if item.official else 1,
            0 if item.direct else 1,
            0 if item.signed is True else 1,
            item.release_date or "0000-00-00",
            item.title.lower(),
        ),
        reverse=False,
    )
    return [item.to_dict() for item in ordered[:500]]
