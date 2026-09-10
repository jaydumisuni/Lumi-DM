"""Deterministic computer operating-system catalogue for Lumi.

Official files are preferred. Index/helper providers are clearly labelled and
never disguised as the file publisher. Windows retail ISO resolution uses Fido as
an external GPLv3 helper only after an explicit user request; Lumi does not copy or
modify Fido source inside its own package.
"""
from __future__ import annotations

import base64
from dataclasses import asdict, dataclass
from pathlib import Path
import platform
import re
import shutil
import subprocess
import tempfile
from typing import Any
from urllib.parse import quote_plus, urljoin, urlparse

from bs4 import BeautifulSoup
import requests

from .firmware import FirmwareResult, _CACHE, _date, _get_json, _get_text, _safe_id


@dataclass(slots=True)
class OSProvider:
    id: str
    name: str
    family: str
    group: str
    official: bool
    direct_files: bool
    description: str
    homepage: str
    attribution: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


_PROVIDERS = [
    OSProvider(
        id="windows-fido",
        name="Microsoft retail ISO via Fido",
        family="Windows",
        group="Official OS",
        official=False,
        direct_files=True,
        description="Resolves temporary official Microsoft retail ISO links using the standalone Fido helper.",
        homepage="https://github.com/pbatard/Fido",
        attribution="Fido by Pete Batard, GPLv3 or later. Downloaded and executed as a separate helper only on Windows.",
    ),
    OSProvider(
        id="microsoft-downloads",
        name="Microsoft Software Download",
        family="Windows",
        group="Official OS",
        official=True,
        direct_files=False,
        description="Microsoft's official Windows software-download pages and Media Creation Tool entry points.",
        homepage="https://www.microsoft.com/software-download/",
    ),
    OSProvider(
        id="apple-support",
        name="Apple macOS downloads",
        family="macOS",
        group="Official OS",
        official=True,
        direct_files=False,
        description="Apple's supported App Store, browser, Recovery and softwareupdate methods.",
        homepage="https://support.apple.com/102662",
    ),
    OSProvider(
        id="mrmacintosh",
        name="Mr. Macintosh installer index",
        family="macOS",
        group="Official-file index",
        official=False,
        direct_files=True,
        description="Indexes public and beta InstallAssistant.pkg links hosted on Apple's own servers.",
        homepage="https://mrmacintosh.com/category/macos-installer/",
        attribution="Mr. Macintosh is used as an index; each direct result exposes the Apple file host and original source page.",
    ),
    OSProvider(
        id="ubuntu",
        name="Ubuntu",
        family="Linux",
        group="Official Linux",
        official=True,
        direct_files=True,
        description="Canonical Ubuntu desktop and server images with published SHA-256 checksums.",
        homepage="https://ubuntu.com/download",
    ),
    OSProvider(
        id="debian",
        name="Debian",
        family="Linux",
        group="Official Linux",
        official=True,
        direct_files=True,
        description="Official Debian installer images and signed checksum sources.",
        homepage="https://www.debian.org/download",
    ),
    OSProvider(
        id="fedora",
        name="Fedora",
        family="Linux",
        group="Official Linux",
        official=True,
        direct_files=True,
        description="Official Fedora Workstation and Server ISO images.",
        homepage="https://fedoraproject.org/workstation/download/",
    ),
    OSProvider(
        id="kali",
        name="Kali Linux",
        family="Linux",
        group="Official Linux",
        official=True,
        direct_files=True,
        description="Official Kali installer, live and netinstaller images with SHA-256 evidence.",
        homepage="https://www.kali.org/get-kali/",
    ),
]


_WINDOWS = {
    "versions": ["Windows 11", "Windows 10"],
    "editions": ["Home/Pro/Education", "Home/Pro", "Education"],
    "languages": [
        "English International", "English", "Arabic", "Chinese Simplified",
        "Chinese Traditional", "French", "German", "Italian", "Japanese",
        "Korean", "Portuguese Brazil", "Spanish",
    ],
    "architectures": ["x64", "arm64"],
    "channels": ["retail", "all"],
}

_MACOS = {
    "versions": [
        "Latest", "macOS 27", "macOS 26 Tahoe", "macOS 15 Sequoia",
        "macOS 14 Sonoma", "macOS 13 Ventura", "macOS 12 Monterey",
        "macOS 11 Big Sur",
    ],
    "editions": ["Full installer", "Apple Silicon restore IPSW"],
    "architectures": ["Universal", "Apple Silicon", "Intel"],
    "channels": ["public", "beta", "all"],
}

_LINUX = {
    "distributions": ["Ubuntu", "Debian", "Fedora", "Kali Linux"],
    "editions": ["Desktop", "Server", "Installer", "Live", "NetInstaller"],
    "architectures": ["amd64", "arm64"],
    "channels": ["stable", "lts", "testing", "weekly", "all"],
}


def catalogue() -> dict[str, Any]:
    return {
        "families": ["Windows", "macOS", "Linux"],
        "providers": [provider.to_dict() for provider in _PROVIDERS],
        "options": {"Windows": _WINDOWS, "macOS": _MACOS, "Linux": _LINUX},
        "warning": "Use only the exact edition and architecture intended for the target computer. Verify published checksums before installation.",
    }


def _result(
    *, provider: str, source_name: str, group: str, official: bool,
    family: str, title: str, version: str = "", edition: str = "",
    architecture: str = "", channel: str = "stable", url: str = "",
    source_url: str = "", filename: str = "", size: int = 0,
    checksum: str = "", notes: str = "", direct: bool = True,
    metadata: dict[str, Any] | None = None,
) -> FirmwareResult:
    return FirmwareResult(
        id=_safe_id("os", provider, filename or title, architecture),
        provider=provider,
        source_name=source_name,
        source_group=group,
        official=official,
        brand=family,
        device=architecture or edition or family,
        title=title,
        version=version,
        build="",
        channel=channel,
        file_type=edition or "operating system image",
        url=url,
        source_url=source_url or url,
        filename=filename,
        size=size,
        sha256=checksum,
        signed=None,
        release_date="",
        notes=notes,
        direct=direct,
        metadata={"os_family": family, "edition": edition, "architecture": architecture, **(metadata or {})},
    )


def _source_card(provider: str, family: str, title: str, url: str, notes: str) -> FirmwareResult:
    item = next(value for value in _PROVIDERS if value.id == provider)
    return _result(
        provider=provider,
        source_name=item.name,
        group=item.group,
        official=item.official,
        family=family,
        title=title,
        url=url,
        source_url=url,
        notes=notes,
        direct=False,
    )


def _windows_results(version: str, edition: str, architecture: str, language: str) -> list[FirmwareResult]:
    selected = version or "Windows 11"
    query = " ".join(part for part in [selected, edition, language, architecture] if part)
    return [
        _result(
            provider="windows-fido",
            source_name="Fido · Microsoft retail ISO",
            group="Official OS helper",
            official=False,
            family="Windows",
            title=f"Resolve {query or selected} retail ISO",
            version=selected,
            edition=edition or "Home/Pro/Education",
            architecture=architecture or "x64",
            channel="retail",
            source_url="https://github.com/pbatard/Fido",
            notes="Click Resolve official link. Lumi downloads the tagged Fido script from GitHub, runs it as a separate PowerShell helper and displays the temporary Microsoft ISO URL before download.",
            direct=False,
            metadata={"resolver": "fido", "language": language or "English International"},
        ),
        _source_card(
            "microsoft-downloads",
            "Windows",
            f"Open Microsoft's official {selected} download page",
            "https://www.microsoft.com/software-download/",
            "Use this official source when the retail-link helper is unavailable or Microsoft changes its download service.",
        ),
    ]


def _extract_checksum(text: str, filename: str) -> str:
    escaped = re.escape(filename)
    match = re.search(rf"\b([a-f0-9]{{64}})\s+\*?{escaped}\b", text, re.I)
    return match.group(1).lower() if match else ""


def _ubuntu_results(version: str, edition: str, architecture: str, channel: str) -> list[FirmwareResult]:
    source = "https://raw.githubusercontent.com/canonical/ubuntu.com/main/releases.yaml"
    text = _CACHE.get("ubuntu-releases-yaml", 60 * 60, lambda: _get_text(source))
    keys = ["latest", "lts", "previous_lts", "previous_previous_lts"]
    releases: list[tuple[str, str, str]] = []
    for key in keys:
        block_match = re.search(rf"(?ms)^{key}:\s*\n(.*?)(?=^[a-zA-Z_]+:\s*$|\Z)", text)
        if not block_match:
            continue
        block = block_match.group(1)
        full = re.search(r'^\s*full_version:\s*["\']?([^"\'\n]+)', block, re.M)
        name = re.search(r'^\s*name:\s*["\']?([^"\'\n]+)', block, re.M)
        if full:
            releases.append((key, full.group(1).strip(), name.group(1).strip() if name else "Ubuntu"))
    wanted = version.strip().lower()
    if wanted:
        releases = [item for item in releases if wanted in item[1].lower() or wanted in item[2].lower() or wanted == item[0]] or releases
    results: list[FirmwareResult] = []
    arch = architecture or "amd64"
    for key, full, name in releases:
        if channel == "lts" and key not in {"lts", "previous_lts", "previous_previous_lts"}:
            continue
        types = [edition.lower()] if edition else ["desktop", "server"]
        for image_type in types:
            if image_type not in {"desktop", "server"}:
                continue
            if arch == "amd64":
                base = f"https://releases.ubuntu.com/{full}/"
            else:
                base = f"https://cdimage.ubuntu.com/releases/{full}/release/"
            filename = f"ubuntu-{full}-{image_type}-{arch}.iso"
            checksum = _extract_checksum(text, filename)
            results.append(_result(
                provider="ubuntu",
                source_name="Canonical Ubuntu",
                group="Official Linux",
                official=True,
                family="Linux",
                title=f"Ubuntu {full} {image_type.title()} {arch}",
                version=full,
                edition=image_type.title(),
                architecture=arch,
                channel="lts" if key != "latest" or "04" in full else "stable",
                url=base + filename,
                source_url="https://ubuntu.com/download",
                filename=filename,
                checksum=checksum,
                notes=f"{name}. Official Canonical image. Verify SHA-256 before writing it to USB.",
                direct=True,
            ))
    return results


def _links_from_html(page: str, allowed_hosts: set[str], suffixes: tuple[str, ...]) -> list[tuple[str, str]]:
    html = _CACHE.get(f"os-page:{page}", 45 * 60, lambda: _get_text(page))
    soup = BeautifulSoup(html, "html.parser")
    found: list[tuple[str, str]] = []
    for link in soup.select("a[href]"):
        href = urljoin(page, str(link.get("href") or ""))
        parsed = urlparse(href)
        host = parsed.hostname.lower() if parsed.hostname else ""
        if allowed_hosts and not any(host == value or host.endswith(f".{value}") for value in allowed_hosts):
            continue
        clean = parsed.path.lower()
        if suffixes and not any(clean.endswith(suffix) for suffix in suffixes):
            continue
        parent = link.find_parent(["tr", "li", "p", "div"])
        context = " ".join(parent.stripped_strings) if parent else link.get_text(" ", strip=True)
        found.append((href, context[:600]))
    dedup: dict[str, str] = {}
    for href, context in found:
        dedup[href] = context
    return list(dedup.items())


def _debian_results(edition: str, architecture: str) -> list[FirmwareResult]:
    page = "https://www.debian.org/download"
    arch = architecture or "amd64"
    results: list[FirmwareResult] = []
    try:
        links = _links_from_html(page, {"debian.org", "cdimage.debian.org"}, (".iso",))
    except Exception:
        links = []
    for href, context in links:
        filename = href.rsplit("/", 1)[-1].split("?", 1)[0]
        lower = filename.lower()
        if arch not in lower:
            continue
        if edition and edition.lower() == "live" and "live" not in lower:
            continue
        if edition and edition.lower() in {"installer", "netinstaller"} and not any(value in lower for value in ["netinst", "dvd", "bd"]):
            continue
        version_match = re.search(r"debian-([0-9.]+)", lower)
        results.append(_result(
            provider="debian", source_name="Debian Project", group="Official Linux",
            official=True, family="Linux", title=context or filename,
            version=version_match.group(1) if version_match else "current",
            edition="NetInstaller" if "netinst" in lower else "Installer",
            architecture=arch, channel="stable", url=href, source_url=page,
            filename=filename,
            notes="Official Debian image. Validate the signed checksum files available beside the ISO.",
            direct=True,
        ))
    if not results:
        results.append(_source_card("debian", "Linux", "Open official Debian image selector", page, "Choose the architecture and installer type from Debian's official download service."))
    return results


def _fedora_results(edition: str, architecture: str) -> list[FirmwareResult]:
    pages = [
        ("Workstation", "https://fedoraproject.org/workstation/download/"),
        ("Server", "https://fedoraproject.org/server/download/"),
    ]
    arch = architecture or "amd64"
    results: list[FirmwareResult] = []
    for kind, page in pages:
        if edition and edition.lower() not in {kind.lower(), "desktop" if kind == "Workstation" else "server"}:
            continue
        try:
            links = _links_from_html(page, {"fedoraproject.org", "download.fedoraproject.org", "dl.fedoraproject.org"}, (".iso",))
        except Exception:
            links = []
        for href, context in links:
            filename = href.rsplit("/", 1)[-1].split("?", 1)[0]
            lower = filename.lower()
            if arch == "amd64" and not any(value in lower for value in ["x86_64", "amd64"]):
                continue
            if arch == "arm64" and not any(value in lower for value in ["aarch64", "arm64"]):
                continue
            version_match = re.search(r"fedora-[^-]+-(\d+)", filename, re.I)
            results.append(_result(
                provider="fedora", source_name="Fedora Project", group="Official Linux",
                official=True, family="Linux", title=context or filename,
                version=version_match.group(1) if version_match else "current",
                edition=kind, architecture=arch, channel="stable", url=href,
                source_url=page, filename=filename,
                notes="Official Fedora image. Compare its checksum with the Fedora verification page.",
                direct=True,
            ))
    if not results:
        results.append(_source_card("fedora", "Linux", "Open official Fedora download selector", pages[0][1], "Choose Workstation, Server or a Fedora Spin from the official project site."))
    return results


def _kali_results(edition: str, architecture: str, channel: str) -> list[FirmwareResult]:
    page = "https://cdimage.kali.org/current/"
    arch = "arm64" if architecture == "arm64" else "amd64"
    try:
        html = _CACHE.get("kali-current-index", 30 * 60, lambda: _get_text(page))
        sums = _CACHE.get("kali-current-sha256", 30 * 60, lambda: _get_text(urljoin(page, "SHA256SUMS")))
    except Exception:
        return [_source_card("kali", "Linux", "Open official Kali download selector", "https://www.kali.org/get-kali/", "Choose installer, live, netinstaller or weekly images from Kali's official page.")]
    soup = BeautifulSoup(html, "html.parser")
    requested = edition.lower() if edition else ""
    candidates: dict[str, dict[str, str]] = {}
    for link in soup.select('a[href]'):
        filename = str(link.get("href") or "").rsplit("/", 1)[-1]
        lower = filename.lower()
        if not (lower.endswith(".iso") or lower.endswith(".iso.torrent")):
            continue
        if arch not in lower:
            continue
        if requested == "live" and "live" not in lower:
            continue
        if requested == "netinstaller" and "netinst" not in lower:
            continue
        if requested == "installer" and ("installer" not in lower or "netinst" in lower):
            continue
        iso_name = filename[:-8] if lower.endswith(".torrent") else filename
        entry = candidates.setdefault(iso_name, {})
        entry["torrent" if lower.endswith(".torrent") else "iso"] = filename

    results: list[FirmwareResult] = []
    for iso_name, entry in sorted(candidates.items()):
        filename = entry.get("iso") or entry.get("torrent") or ""
        if not filename:
            continue
        lower = filename.lower()
        transport = "http" if entry.get("iso") else "torrent"
        version_match = re.search(r"kali-linux-([0-9.]+)", lower)
        result_edition = "Live" if "live" in lower else "NetInstaller" if "netinst" in lower else "Installer"
        results.append(_result(
            provider="kali", source_name="Kali Linux", group="Official Linux",
            official=True, family="Linux", title=filename,
            version=version_match.group(1) if version_match else "current",
            edition=result_edition, architecture=arch, channel="stable" if channel != "weekly" else "weekly",
            url=urljoin(page, filename), source_url="https://www.kali.org/get-kali/",
            filename=filename, checksum=_extract_checksum(sums, iso_name),
            notes=(
                "Official Kali image. Lumi keeps the published SHA-256 so it can be verified after download."
                if transport == "http"
                else "Official Kali torrent. Lumi uses its existing BitTorrent engine because the current Kali index does not publish this image as a direct ISO."
            ),
            direct=True,
            metadata={"download_transport": transport, "image_filename": iso_name},
        ))
    return results


_MACOS_INSTALLER_PAGES = {
    "27": "https://mrmacintosh.com/macos-golden-gate-full-installer-database-download-directly-from-apple/",
    "26": "https://mrmacintosh.com/macos-tahoe-full-installer-database-download-directly-from-apple/",
    "15": "https://mrmacintosh.com/macos-sequoia-full-installer-database-download-directly-from-apple/",
    "14": "https://mrmacintosh.com/macos-sonoma-full-installer-database-download-directly-from-apple/",
    "13": "https://mrmacintosh.com/macos-ventura-13-full-installer-database-download-directly-from-apple/",
    "12": "https://mrmacintosh.com/macos-12-monterey-full-installer-database-download-directly-from-apple/",
    "11": "https://mrmacintosh.com/macos-big-sur-full-installer-database-download-directly-from-apple/",
}


def _macos_major(version: str) -> str:
    text = str(version or "").strip()
    if not text or text.lower() == "latest":
        return "27"
    match = re.search(r"\b(27|26|15|14|13|12|11)\b", text)
    return match.group(1) if match else ""


def _macos_installer_page(version: str) -> str:
    major = _macos_major(version)
    return _MACOS_INSTALLER_PAGES.get(major, _MACOS_INSTALLER_PAGES["27"])


def _parse_macos_installer_page(
    html: str, *, source_url: str, major: str, channel: str,
) -> list[FirmwareResult]:
    soup = BeautifulSoup(html, "html.parser")
    values: list[FirmwareResult] = []
    seen: set[str] = set()
    for row in soup.select("tr"):
        link = next((
            item for item in row.select("a[href]")
            if "installassistant.pkg" in str(item.get("href") or "").lower()
        ), None)
        if link is None:
            continue
        href = urljoin(source_url, str(link.get("href") or ""))
        host = (urlparse(href).hostname or "").lower()
        if not (host == "apple.com" or host.endswith(".apple.com")):
            continue
        context = row.get_text(" ", strip=True)
        versions = re.findall(r"(?<![A-Za-z0-9])([0-9]{1,2}(?:\.[0-9]+){1,2})(?![A-Za-z0-9])", context)
        version_value = next((value for value in versions if value.split(".", 1)[0] == major), "")
        if not version_value:
            continue
        lower = context.lower()
        build_match = re.search(r"\b([0-9]{2}[A-Z][0-9]{2,5}[A-Za-z]?)\b", context)
        seed_build = bool(build_match and re.search(r"[a-z]$", build_match.group(1)))
        is_beta = seed_build or "beta" in lower or "developer" in lower or "release candidate" in lower or " rc" in lower
        item_channel = "beta" if is_beta else "public"
        if channel not in {"", "all", item_channel}:
            continue
        if href in seen:
            continue
        seen.add(href)
        filename = href.rsplit("/", 1)[-1].split("?", 1)[0] or "InstallAssistant.pkg"
        latest = "latest" in lower
        item = _result(
            provider="mrmacintosh", source_name="Mr. Macintosh index · Apple-hosted file",
            group="Official-file index", official=False, family="macOS",
            title=f"macOS {version_value} InstallAssistant.pkg",
            version=version_value,
            edition="Full installer", architecture="Universal",
            channel=item_channel, url=href, source_url=source_url, filename=filename,
            notes="The index is third-party, but this InstallAssistant.pkg is hosted on Apple's servers. Lumi binds version/build evidence from the same table row.",
            direct=True,
            metadata={"file_host": host, "latest": latest, "row_evidence": context[:240]},
        )
        item.build = build_match.group(1) if build_match else ""
        item.id = _safe_id("os", "mrmacintosh", version_value, item.build or "build", href)
        values.append(item)
    values.sort(key=lambda item: (not bool(item.metadata.get("latest")), tuple(-int(part) for part in item.version.split("."))))
    return values


def _macos_results(version: str, edition: str, architecture: str, channel: str) -> list[FirmwareResult]:
    support = _source_card(
        "apple-support", "macOS", "Apple's official macOS download methods",
        "https://support.apple.com/102662",
        "Apple documents Software Update, Recovery, App Store, browser and Terminal methods, including softwareupdate --fetch-full-installer.",
    )
    if edition and "ipsw" in edition.lower():
        return [support, _source_card(
            "mrmacintosh", "macOS", "Apple Silicon restore IPSW database",
            "https://mrmacintosh.com/apple-silicon-m1-full-macos-restore-ipsw-firmware-files-database/",
            "This index points to Apple-hosted restore IPSWs. Confirm the exact Mac model before restoring.",
        )]
    major = _macos_major(version)
    page = _macos_installer_page(version)
    if not major:
        return [support, _source_card("mrmacintosh", "macOS", "Open the macOS full-installer index", "https://mrmacintosh.com/category/macos-installer/", "Browse public and beta full installers. Direct files are hosted on Apple's servers when available.")]
    def load_major(selected_major: str) -> list[FirmwareResult]:
        selected_page = _MACOS_INSTALLER_PAGES[selected_major]
        try:
            html = _CACHE.get(f"mrmacintosh-macos-{selected_major}", 60 * 60, lambda: _get_text(selected_page))
            return _parse_macos_installer_page(html, source_url=selected_page, major=selected_major, channel=channel)
        except Exception:
            return []

    direct = load_major(major)
    if not direct and str(version or "").strip().lower() == "latest":
        for fallback_major in ("26", "15", "14", "13", "12", "11"):
            direct = load_major(fallback_major)
            if direct:
                page = _MACOS_INSTALLER_PAGES[fallback_major]
                break
    if direct:
        return [support, *direct]
    return [support, _source_card("mrmacintosh", "macOS", "Open the macOS full-installer index", page, "No direct Apple-hosted installer matched the requested macOS generation. Review the source index rather than using an inferred installer.")]


def search_os(
    *, family: str, distribution: str = "", version: str = "",
    edition: str = "", architecture: str = "", channel: str = "all",
    language: str = "", query: str = "",
) -> list[dict[str, Any]]:
    family_lower = family.strip().lower()
    if family_lower == "windows":
        values = _windows_results(version, edition, architecture, language)
    elif family_lower in {"macos", "mac os"}:
        values = _macos_results(version, edition, architecture, channel)
    elif family_lower == "linux":
        distro = distribution.strip().lower()
        if distro == "ubuntu":
            values = _ubuntu_results(version, edition, architecture, channel)
        elif distro == "debian":
            values = _debian_results(edition, architecture)
        elif distro == "fedora":
            values = _fedora_results(edition, architecture)
        elif distro in {"kali", "kali linux"}:
            values = _kali_results(edition, architecture, channel)
        else:
            values = []
            for loader in (
                lambda: _ubuntu_results(version, edition, architecture, channel),
                lambda: _debian_results(edition, architecture),
                lambda: _fedora_results(edition, architecture),
                lambda: _kali_results(edition, architecture, channel),
            ):
                try:
                    values.extend(loader())
                except Exception:
                    continue
    else:
        values = []
    needle = query.strip().lower()
    if needle:
        values = [item for item in values if needle in " ".join([
            item.title, item.version, item.file_type, item.filename,
            item.source_name, item.notes, item.device,
        ]).lower()]
    dedup: dict[str, FirmwareResult] = {item.id: item for item in values}

    def version_rank(item: FirmwareResult) -> tuple[int, int, int]:
        parts = [int(value) for value in re.findall(r"\d+", str(item.version or ""))[:3]]
        parts = (parts + [0, 0, 0])[:3]
        return tuple(-value for value in parts)

    ordered = sorted(dedup.values(), key=lambda item: (
        0 if item.official else 1,
        0 if item.direct else 1,
        0 if item.metadata.get("latest") else 1,
        version_rank(item),
        item.source_name.lower(),
        item.title.lower(),
    ))
    return [item.to_dict() for item in ordered[:300]]


def _github_json(url: str) -> Any:
    session = requests.Session()
    session.trust_env = False
    response = session.get(url, timeout=(8, 25), headers={
        "User-Agent": "Lumi-DM-OS-Catalog/1.0",
        "Accept": "application/vnd.github+json",
    })
    response.raise_for_status()
    return response.json()


def _fido_script() -> tuple[Path, str]:
    release = _github_json("https://api.github.com/repos/pbatard/Fido/releases/latest")
    tag = str(release.get("tag_name") or "master")
    content = _github_json(f"https://api.github.com/repos/pbatard/Fido/contents/Fido.ps1?ref={quote_plus(tag)}")
    encoded = str(content.get("content") or "").replace("\n", "")
    if not encoded:
        raise RuntimeError("Fido release did not expose Fido.ps1")
    raw = base64.b64decode(encoded)
    directory = Path(tempfile.gettempdir()) / "lumi-fido"
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"Fido-{re.sub(r'[^a-zA-Z0-9._-]+', '-', tag)}.ps1"
    if not path.exists() or path.read_bytes() != raw:
        path.write_bytes(raw)
    return path, tag


def resolve_windows_iso(
    *, version: str, edition: str, language: str, architecture: str,
) -> dict[str, Any]:
    if platform.system().lower() != "windows":
        raise RuntimeError("Fido retail-link resolution is available only on Windows. Open the Microsoft source page on this platform.")
    powershell = shutil.which("powershell.exe") or shutil.which("powershell") or shutil.which("pwsh.exe") or shutil.which("pwsh")
    if not powershell:
        raise RuntimeError("PowerShell is required to resolve a Microsoft retail ISO link with Fido")
    script, tag = _fido_script()
    win = "11" if "11" in (version or "11") else "10"
    command = [
        powershell, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(script),
        "-Win", win, "-Rel", "Latest",
        "-Ed", edition or "Home/Pro",
        "-Lang", language or "English International",
        "-Arch", architecture or "x64",
        "-GetUrl",
    ]
    completed = subprocess.run(command, capture_output=True, text=True, timeout=120, check=False)
    output = f"{completed.stdout}\n{completed.stderr}"
    urls = re.findall(r"https://[^\s'\"]+", output)
    url = next((value for value in reversed(urls) if ".iso" in value.lower()), "")
    if completed.returncode != 0 or not url:
        clean = " ".join(line.strip() for line in output.splitlines() if line.strip())[-800:]
        raise RuntimeError(clean or "Fido could not resolve a Microsoft ISO link")
    filename = url.split("?", 1)[0].rsplit("/", 1)[-1]
    result = _result(
        provider="windows-fido", source_name=f"Fido {tag} · Microsoft-hosted ISO",
        group="Official OS helper", official=False, family="Windows",
        title=f"{version or 'Windows'} {edition or 'Home/Pro'} {language or 'English International'} {architecture or 'x64'}",
        version=version or f"Windows {win}", edition=edition or "Home/Pro",
        architecture=architecture or "x64", channel="retail", url=url,
        source_url="https://github.com/pbatard/Fido", filename=filename,
        notes="Temporary official Microsoft retail ISO URL resolved by the separate Fido GPLv3 helper. Start the download before the URL expires.",
        direct=True,
        metadata={"resolver": "fido", "fido_version": tag, "language": language or "English International", "temporary_url": True},
    )
    return result.to_dict()
