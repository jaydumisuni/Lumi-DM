from __future__ import annotations

import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def git_blob_sha1(data: bytes) -> str:
    header = f"blob {len(data)}\0".encode("ascii")
    return hashlib.sha1(header + data).hexdigest()


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def manifest() -> dict:
    return json.loads((ROOT / "assets" / "branding-manifest.json").read_text(encoding="utf-8"))


def test_owner_approved_lumi_logo_is_canonical() -> None:
    brand = manifest()
    approved = (ROOT / brand["canonical_source"]).read_bytes()
    duplicate = (ROOT / "Resouces" / "download manager logo.png").read_bytes()

    assert approved == duplicate
    assert git_blob_sha1(approved) == brand["canonical_source_git_blob_sha1"]
    assert hashlib.sha256(approved).hexdigest() == brand["canonical_source_sha256"]


def test_every_generated_identity_asset_is_hash_locked() -> None:
    brand = manifest()
    generated = brand["generated_identity_assets_sha256"]
    assert len(generated) == brand["generator"]["generated_asset_count"]
    assert len(generated) == 41

    for relative, expected_hash in generated.items():
        asset = ROOT / relative
        assert asset.is_file(), relative
        assert sha256(asset) == expected_hash, relative


def test_runtime_identity_points_only_to_verified_lumi_assets() -> None:
    brand = manifest()
    identity = brand["verified_runtime_identity"]
    generated = brand["generated_identity_assets_sha256"]
    build = json.loads((ROOT / "techguy-build.json").read_text(encoding="utf-8"))
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")

    assert build["logo"] == identity["desktop_builder_logo"]
    assert build["icon"] == identity["desktop_builder_icon"]
    assert generated[identity["desktop_builder_logo"]] == identity["desktop_builder_logo_sha256"]
    assert generated[identity["desktop_builder_icon"]] == identity["desktop_builder_icon_sha256"]
    assert sha256(ROOT / identity["desktop_builder_logo"]) == identity["desktop_builder_logo_sha256"]
    assert sha256(ROOT / identity["desktop_builder_icon"]) == identity["desktop_builder_icon_sha256"]

    sidebar_source = brand["surfaces"]["main_sidebar"]["source"]
    assert sidebar_source == identity["desktop_builder_logo"]
    assert f'src="/{sidebar_source}" alt="Lumi" class="brand-logo"' in html

    extension_path = ROOT / identity["browser_extension_icon"]
    extension = extension_path.read_text(encoding="utf-8")
    assert generated[identity["browser_extension_icon"]] == identity["browser_extension_icon_sha256"]
    assert sha256(extension_path) == identity["browser_extension_icon_sha256"]
    assert "data:image/" in extension
    assert "placeholder extension icon" not in extension


def test_audited_native_identity_assets_are_hash_locked() -> None:
    brand = manifest()
    identity = brand["verified_runtime_identity"]
    generated = brand["generated_identity_assets_sha256"]
    pairs = [
        ("windows_native_icon", "windows_native_icon_sha256"),
        ("browser_extension_native_reference", "browser_extension_native_reference_sha256"),
        ("android_launcher_reference", "android_launcher_reference_sha256"),
        ("ios_launcher_reference", "ios_launcher_reference_sha256"),
        ("macos_launcher_reference", "macos_launcher_reference_sha256"),
    ]
    for path_key, hash_key in pairs:
        relative = identity[path_key]
        asset = ROOT / relative
        assert asset.is_file(), relative
        assert generated[relative] == identity[hash_key]
        assert sha256(asset) == identity[hash_key]


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
    assert 'const requestId = ++storageRequestId' in ui
    assert 'if (requestId !== storageRequestId) return;' in ui


def test_stale_reminal_preview_is_removed() -> None:
    assert not (ROOT / "static" / "preview.html").exists()
    service_worker = (ROOT / "static" / "sw.js").read_text(encoding="utf-8")
    assert "preview.html" not in service_worker
    assert "LUMIDM-static-v2" in service_worker
    for required in (
        "/static/app-hardening.js",
        "/static/technician-workspaces.css",
        "/static/main-ui.js",
        "/static/main-ui-core.js",
        "/static/main-ui-views.js",
        "/static/main-ui-settings.js",
        "/static/main-ui-shell.js",
        "/static/main-ui-download.js",
        "/static/main-ui-fixes.js",
    ):
        assert required in service_worker
