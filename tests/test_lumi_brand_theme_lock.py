from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def git_blob_sha1(data: bytes) -> str:
    header = f"blob {len(data)}\0".encode("ascii")
    return hashlib.sha1(header + data).hexdigest()


def test_owner_approved_lumi_logo_is_canonical() -> None:
    manifest = json.loads((ROOT / "assets" / "branding-manifest.json").read_text(encoding="utf-8"))
    approved = (ROOT / manifest["canonical_source"]).read_bytes()
    duplicate = (ROOT / "Resouces" / "download manager logo.png").read_bytes()

    assert approved == duplicate
    assert git_blob_sha1(approved) == manifest["canonical_source_git_blob_sha1"]
    assert hashlib.sha256(approved).hexdigest() == manifest["canonical_source_sha256"]


def test_runtime_identity_points_only_to_verified_lumi_assets() -> None:
    manifest = json.loads((ROOT / "assets" / "branding-manifest.json").read_text(encoding="utf-8"))
    build = json.loads((ROOT / "techguy-build.json").read_text(encoding="utf-8"))
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    extension = (ROOT / "static" / "browser-extension" / "chromium" / "icon.svg").read_text(encoding="utf-8")

    assert build["logo"] == manifest["verified_runtime_identity"]["desktop_builder_logo"]
    assert build["icon"] == manifest["verified_runtime_identity"]["desktop_builder_icon"]
    assert 'src="/static/favicon-96.png" alt="Lumi" class="brand-logo"' in html
    assert "data:image/" in extension
    assert "placeholder extension icon" not in extension


def test_lumi_dark_is_default_and_clear_glass_is_the_only_light_theme() -> None:
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    theme = (ROOT / "static" / "lumi-theme.js").read_text(encoding="utf-8")
    glass = (ROOT / "static" / "lumi-clear-glass.css").read_text(encoding="utf-8")

    assert '/static/lumi-theme.js' in html
    assert '/static/lumi-approved-ui.css' in html
    assert '/static/lumi-clear-glass.css' in html
    assert 'const DARK = "dark"' in theme
    assert 'const GLASS = "glass"' in theme
    assert 'return DARK;' in theme
    assert 'data-ttg-theme="glass"' in glass
    assert 'data-ttg-theme="light"' not in glass


def test_approved_shell_storage_and_categories_are_runtime_bound() -> None:
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    ui = (ROOT / "static" / "lumi-ui.js").read_text(encoding="utf-8")

    assert 'id="lumi-storage-drive"' in html
    assert 'id="lumi-storage-free"' in html
    assert 'id="lumi-storage-best-speed"' in html
    assert 'THETECHGUY TOOL' in ui
    assert '/api/v4/maintenance/storage' in ui
    assert 'clear.dataset.mainView = "categories"' in ui


def test_stale_reminal_preview_is_removed() -> None:
    assert not (ROOT / "static" / "preview.html").exists()
    service_worker = (ROOT / "static" / "sw.js").read_text(encoding="utf-8")
    assert "preview.html" not in service_worker
    assert "LUMIDM-static-v2" in service_worker
