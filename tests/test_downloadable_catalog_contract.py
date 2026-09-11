from pathlib import Path

from core.v5 import api, os_api

ROOT = Path(__file__).resolve().parents[1]


def test_firmware_catalogue_exposes_downloadable_providers_only():
    values = api._downloadable_providers([
        {"id": "direct", "direct_files": True},
        {"id": "source-only", "direct_files": False},
    ])
    assert [item["id"] for item in values] == ["direct"]


def test_firmware_results_drop_source_and_resolver_rows():
    values = api._downloadable_firmware_results([
        {"id": "download", "direct": True, "url": "https://example.invalid/fw.zip"},
        {"id": "source", "direct": False, "url": "https://example.invalid/page"},
        {"id": "empty", "direct": True, "url": ""},
    ])
    assert [item["id"] for item in values] == ["download"]


def test_os_results_drop_source_rows_and_windows_is_resolved_before_display(monkeypatch):
    monkeypatch.setattr(os_api, "search_os", lambda **kwargs: [
        {"id": "fido", "direct": False, "url": "", "metadata": {"resolver": "fido"}},
        {"id": "source", "direct": False, "url": "https://example.invalid/source"},
    ])
    monkeypatch.setattr(os_api, "resolve_windows_iso", lambda **kwargs: {"id": "resolved", "direct": True, "url": "https://software-download.microsoft.com/win.iso"})
    values = os_api._downloadable_os_results(family="Windows", distribution="", version="Windows 11", edition="Home/Pro", architecture="x64", channel="retail", language="English International", query="")
    assert values == [{"id": "resolved", "direct": True, "url": "https://software-download.microsoft.com/win.iso"}]


def test_os_and_firmware_tables_have_download_action_only():
    os_js = (ROOT / "static" / "operating-systems.js").read_text(encoding="utf-8")
    firmware_js = (ROOT / "static" / "technician-workspaces.js").read_text(encoding="utf-8")
    assert 'data-os-action="resolve"' not in os_js
    assert 'data-os-action="source"' not in os_js
    assert 'data-firmware-action="resolve-samsung"' not in firmware_js
    assert 'data-firmware-action="source"' not in firmware_js
