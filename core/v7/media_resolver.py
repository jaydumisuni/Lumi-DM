"""Browser-first media normalization for Lumi.

The browser owns session truth. Structured browser observations are therefore
accepted as primary evidence; yt-dlp is a bounded resolver fallback/augmenter,
not a requirement for recognizing media already observed in the active tab.
"""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from typing import Any
import hashlib
import re
from urllib.parse import urlparse
from pathlib import PurePosixPath

from core.v3.media import MediaInspector


TERMINAL_STATES = {
    "variants_found",
    "no_downloadable_media",
    "session_unavailable",
    "resolver_timeout",
    "unsupported_protected",
    "error",
}
_QUALITY_TOKEN = re.compile(r"(?<!\d)(\d{3,4})p(?!\d)", re.IGNORECASE)
_DIMENSION_TOKEN = re.compile(r"(?<!\d)(\d{3,4})[xX](\d{3,4})(?!\d)")


def _number(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _variant_id(value: dict[str, Any]) -> str:
    raw = "|".join(str(value.get(key) or "") for key in (
        "source", "format_id", "url", "kind", "width", "height", "fps",
        "vcodec", "acodec", "container", "bitrate", "language",
    ))
    return hashlib.sha1(raw.encode("utf-8", errors="ignore")).hexdigest()[:16]


def _url_quality(url: str) -> tuple[int, int]:
    """Recover explicit per-source dimensions without inventing metadata.

    HTML <source> alternatives share one parent <video>, so the browser's
    ``videoHeight`` describes only the active stream. If an alternative URL
    explicitly names its own 720p/1080p or WxH quality, that source-local token
    is stronger evidence than the parent's active dimensions. Otherwise the
    caller keeps the observed values unchanged.
    """
    try:
        path = urlparse(url).path
    except Exception:
        path = url
    dimension = _DIMENSION_TOKEN.search(path)
    if dimension:
        width = int(dimension.group(1))
        height = int(dimension.group(2))
        if 120 <= height <= 4320 and 160 <= width <= 8192:
            return width, height
    quality = _QUALITY_TOKEN.search(path)
    if quality:
        height = int(quality.group(1))
        if 120 <= height <= 4320:
            return 0, height
    return 0, 0


def _url_container(url: str) -> str:
    try:
        suffix = PurePosixPath(urlparse(url).path).suffix.lower().lstrip(".")
    except Exception:
        suffix = ""
    return suffix if suffix in {"mp4", "webm", "m4v", "mov", "mkv", "m4a", "mp3", "aac", "ogg", "opus", "wav", "m3u8", "mpd"} else ""


def _browser_variant(item: dict[str, Any]) -> dict[str, Any] | None:
    url = str(item.get("url") or "").strip()
    if not url.startswith(("http://", "https://")):
        return None
    kind = str(item.get("kind") or "direct").lower()
    width = int(_number(item.get("width")))
    height = int(_number(item.get("height")))
    source_width, source_height = _url_quality(url)
    if source_height:
        height = source_height
        if source_width:
            width = source_width
    fps = _number(item.get("fps"))
    bitrate = int(_number(item.get("bitrate") or item.get("bandwidth")))
    container = str(item.get("container") or item.get("ext") or "").lower() or _url_container(url)
    value = {
        "source": "browser",
        "format_id": str(item.get("format_id") or ""),
        "kind": kind,
        "url": url,
        "container": container,
        "width": width,
        "height": height,
        "fps": fps,
        "vcodec": str(item.get("vcodec") or item.get("codecs") or ""),
        "acodec": str(item.get("acodec") or ""),
        "bitrate": bitrate,
        "filesize": int(_number(item.get("filesize"))),
        "language": str(item.get("language") or ""),
        "label": str(item.get("label") or (f"{height}p" if height else kind.upper())),
        "audio_only": bool(item.get("audio_only")),
        "video_only": bool(item.get("video_only")),
        "hdr": str(item.get("hdr") or item.get("dynamic_range") or ""),
    }
    # If the browser supplied a generic parent-video label, keep the normalized
    # source-local quality visible instead of perpetuating the active stream's
    # dimensions across every alternative.
    label = value["label"].lower()
    if source_height and ("page video" in label or "browser resource" in label):
        value["label"] = f"{source_height}p"
    value["id"] = _variant_id(value)
    return value


def _yt_variant(item: dict[str, Any]) -> dict[str, Any] | None:
    format_id = str(item.get("format_id") or "")
    if not format_id:
        return None
    vcodec = str(item.get("vcodec") or "none")
    acodec = str(item.get("acodec") or "none")
    audio_only = vcodec == "none" and acodec != "none"
    video_only = vcodec != "none" and acodec == "none"
    protocol = str(item.get("protocol") or "")
    kind = "hls" if "m3u8" in protocol else "dash" if "dash" in protocol or "http_dash" in protocol else "format"
    height = int(_number(item.get("height")))
    value = {
        "source": "resolver",
        "format_id": format_id,
        "kind": kind,
        "url": "",
        "container": str(item.get("ext") or "").lower(),
        "width": int(_number(item.get("width"))),
        "height": height,
        "fps": _number(item.get("fps")),
        "vcodec": vcodec,
        "acodec": acodec,
        "bitrate": int(_number(item.get("tbr")) * 1000),
        "filesize": int(_number(item.get("filesize"))),
        "language": str(item.get("language") or ""),
        "label": str(item.get("format_note") or (f"{height}p" if height else "Audio" if audio_only else format_id)),
        "audio_only": audio_only,
        "video_only": video_only,
        "hdr": str(item.get("dynamic_range") or ""),
    }
    value["id"] = _variant_id(value)
    return value


def _deduplicate(values: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple[Any, ...]] = set()
    result: list[dict[str, Any]] = []
    for item in values:
        key = (
            item.get("source"), item.get("format_id"), item.get("url"),
            item.get("kind"), item.get("width"), item.get("height"),
            item.get("fps"), item.get("vcodec"), item.get("acodec"),
            item.get("container"), item.get("bitrate"), item.get("language"),
        )
        if key in seen:
            continue
        seen.add(key)
        result.append(item)
    result.sort(key=lambda item: (
        bool(item.get("audio_only")),
        -int(item.get("height") or 0),
        -float(item.get("fps") or 0),
        -int(item.get("bitrate") or 0),
        str(item.get("container") or ""),
    ))
    return result


def discover_media(params: dict[str, Any]) -> dict[str, Any]:
    browser = params.get("browser") if isinstance(params.get("browser"), dict) else {}
    observations = params.get("observations") if isinstance(params.get("observations"), list) else []
    page_url = str(params.get("url") or browser.get("url") or "").strip()
    title = str(browser.get("title") or params.get("title") or "Media")
    subtitles: list[dict[str, Any]] = []
    variants: list[dict[str, Any]] = []

    for raw in observations:
        if not isinstance(raw, dict):
            continue
        if str(raw.get("kind") or "").lower() in {"subtitle", "caption"}:
            url = str(raw.get("url") or "")
            if url.startswith(("http://", "https://")):
                subtitles.append({
                    "url": url,
                    "language": str(raw.get("language") or ""),
                    "label": str(raw.get("label") or raw.get("language") or "Subtitle"),
                    "container": str(raw.get("container") or raw.get("ext") or ""),
                    "source": "browser",
                })
            continue
        item = _browser_variant(raw)
        if item:
            variants.append(item)

    fallback_error = ""
    resolver_info: dict[str, Any] = {}
    if page_url.startswith(("http://", "https://")) and bool(params.get("resolver_fallback", True)):
        executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="lumi-media-resolver")
        future = executor.submit(MediaInspector().inspect, page_url, include_playlist=True)
        try:
            resolver_info = future.result(timeout=max(3, min(30, int(params.get("timeout_seconds") or 12))))
            title = str(resolver_info.get("title") or title)
            for raw in resolver_info.get("formats") or []:
                item = _yt_variant(raw)
                if item:
                    variants.append(item)
            for language, rows in (resolver_info.get("subtitles") or {}).items():
                for raw in rows or []:
                    subtitles.append({
                        "url": "",
                        "language": str(language),
                        "label": str(raw.get("name") or language),
                        "container": str(raw.get("ext") or ""),
                        "source": str(raw.get("source") or "resolver"),
                    })
        except FutureTimeout:
            fallback_error = "resolver_timeout"
            future.cancel()
        except Exception as exc:
            text = str(exc)
            fallback_error = "unsupported_protected" if any(token in text.lower() for token in ("drm", "protected", "encrypted")) else text
        finally:
            executor.shutdown(wait=False, cancel_futures=True)

    variants = _deduplicate(variants)
    if variants:
        state = "variants_found"
    elif fallback_error == "resolver_timeout":
        state = "resolver_timeout"
    elif fallback_error == "unsupported_protected":
        state = "unsupported_protected"
    elif browser.get("has_blob") and not observations:
        state = "session_unavailable"
    elif fallback_error:
        state = "error"
    else:
        state = "no_downloadable_media"

    return {
        "schema": "lumi.media.v1",
        "state": state,
        "terminal": state in TERMINAL_STATES,
        "title": title,
        "page_url": page_url,
        "variants": variants,
        "subtitles": subtitles,
        "playlist": resolver_info.get("entries") or [],
        "thumbnail": str(resolver_info.get("thumbnail") or browser.get("thumbnail") or ""),
        "resolver_error": fallback_error if fallback_error not in {"resolver_timeout", "unsupported_protected"} else "",
        "ffmpeg": bool(resolver_info.get("ffmpeg")),
    }
