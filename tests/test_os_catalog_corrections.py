from __future__ import annotations

from core.v5 import os_catalog


def test_kali_live_uses_official_torrent_when_plain_iso_is_not_published(monkeypatch):
    index = '''<html><body>
      <a href="kali-linux-2026.2-installer-amd64.iso">installer</a>
      <a href="kali-linux-2026.2-live-amd64.iso.torrent">live torrent</a>
    </body></html>'''
    sums = "abc123  kali-linux-2026.2-installer-amd64.iso\n"
    monkeypatch.setattr(os_catalog._CACHE, "get", lambda key, ttl, loader: sums if "sha256" in key else index)
    results = os_catalog._kali_results("Live", "amd64", "stable")
    assert len(results) == 1
    item = results[0]
    assert item.url.endswith("kali-linux-2026.2-live-amd64.iso.torrent")
    assert item.direct is True
    assert item.metadata["download_transport"] == "torrent"
    assert item.file_type == "Live"
    assert item.version == "2026.2"


def test_macos_parser_binds_version_and_build_to_same_table_row():
    html = '''<table>
      <tr><td><a href="https://swcdn.apple.com/a/InstallAssistant.pkg">InstallAssistant.pkg</a></td><td>26.6.2</td><td>25G83</td><td>Latest</td><td>YES</td></tr>
      <tr><td><a href="https://swcdn.apple.com/b/InstallAssistant.pkg">InstallAssistant.pkg</a></td><td>26.5</td><td>25F71</td><td></td><td>YES</td></tr>
      <tr><td><a href="https://example.com/not-apple.pkg">InstallAssistant.pkg</a></td><td>26.7</td><td>25H1</td><td>Latest</td><td>YES</td></tr>
    </table>'''
    results = os_catalog._parse_macos_installer_page(
        html, source_url="https://index.invalid/tahoe/", major="26", channel="public"
    )
    assert [item.version for item in results] == ["26.6.2", "26.5"]
    assert results[0].build == "25G83"
    assert results[0].metadata["latest"] is True
    assert results[0].url == "https://swcdn.apple.com/a/InstallAssistant.pkg"
    assert all(item.metadata["file_host"].endswith("apple.com") for item in results)
    assert len({item.id for item in results}) == len(results)


def test_macos_version_selects_the_correct_named_installer_page():
    assert "tahoe" in os_catalog._macos_installer_page("macOS 26 Tahoe")
    assert "sequoia" in os_catalog._macos_installer_page("macOS 15 Sequoia")
    assert "sonoma" in os_catalog._macos_installer_page("macOS 14 Sonoma")
    assert "golden-gate" in os_catalog._macos_installer_page("Latest")


def test_latest_public_macos_falls_back_to_newest_published_generation(monkeypatch):
    empty_27 = "<html><body>No public InstallAssistant rows yet</body></html>"
    tahoe = """<table><tr><td><a href=\"https://swcdn.apple.com/latest/InstallAssistant.pkg\">InstallAssistant.pkg</a></td><td>26.6.2</td><td>25G83</td><td>Latest</td><td>YES</td></tr></table>"""
    def fake_cache(key, ttl, loader):
        return empty_27 if key.endswith("-27") else tahoe
    monkeypatch.setattr(os_catalog._CACHE, "get", fake_cache)
    results = os_catalog._macos_results("Latest", "Full installer", "Universal", "public")
    direct = [item for item in results if item.direct]
    assert direct
    assert direct[0].version == "26.6.2"
    assert direct[0].metadata["latest"] is True


def test_macos_seed_build_suffix_is_beta_even_when_index_calls_it_public():
    html = """<table><tr><td><a href=\"https://swcdn.apple.com/seed/InstallAssistant.pkg\">InstallAssistant.pkg</a></td><td>27.0</td><td>26A5388g</td><td>Public 2</td><td>YES</td></tr></table>"""
    public = os_catalog._parse_macos_installer_page(html, source_url="https://index.invalid/golden-gate/", major="27", channel="public")
    beta = os_catalog._parse_macos_installer_page(html, source_url="https://index.invalid/golden-gate/", major="27", channel="beta")
    assert public == []
    assert len(beta) == 1
    assert beta[0].channel == "beta"


def test_search_os_keeps_latest_macos_release_ahead_of_older_rows(monkeypatch):
    html = """<table>
      <tr><td><a href=\"https://swcdn.apple.com/old/InstallAssistant.pkg\">InstallAssistant.pkg</a></td><td>26.0</td><td>25A354</td><td></td><td>YES</td></tr>
      <tr><td><a href=\"https://swcdn.apple.com/new/InstallAssistant.pkg\">InstallAssistant.pkg</a></td><td>26.6.2</td><td>25G83</td><td>Latest</td><td>YES</td></tr>
    </table>"""
    monkeypatch.setattr(os_catalog._CACHE, "get", lambda key, ttl, loader: html)
    results = os_catalog.search_os(family="macOS", version="macOS 26 Tahoe", edition="Full installer", architecture="Universal", channel="public")
    direct = [item for item in results if item["direct"]]
    assert [item["version"] for item in direct] == ["26.6.2", "26.0"]
