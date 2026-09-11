from pathlib import Path

from core.v5.browser_api import _normalise_linkgrabber_rows

ROOT = Path(__file__).resolve().parents[1]


def test_browser_link_rows_are_http_only_deduped_and_bounded():
    rows = _normalise_linkgrabber_rows({
        "page_url": "https://example.test/page",
        "links": [
            {"url": "https://example.test/a.zip", "filename": "A", "type": "file"},
            {"url": "https://example.test/a.zip", "filename": "duplicate"},
            {"url": "javascript:alert(1)", "filename": "bad"},
            {"url": "http://example.test/b.iso", "filename": "B"},
        ],
    })
    assert [row["url"] for row in rows] == ["https://example.test/a.zip", "http://example.test/b.iso"]
    assert rows[0]["source_page"] == "https://example.test/page"


def test_bundled_chromium_extension_exposes_linkgrabber_action():
    root = ROOT / "static" / "browser-extension" / "chromium"
    background = (root / "background.js").read_text(encoding="utf-8")
    content = (root / "content-v2.js").read_text(encoding="utf-8")
    popup = (root / "popup.html").read_text(encoding="utf-8")
    popup_js = (root / "popup.js").read_text(encoding="utf-8")
    app = (ROOT / "static" / "app.js").read_text(encoding="utf-8")
    assert 'type === "lumi-linkgrabber-import"' in background
    assert '/api/v5/browser/linkgrabber/import' in background
    assert 'message?.type === "lumi-page-links"' in content
    assert 'id="grab-links"' in popup
    assert 'lumi-linkgrabber-import' in popup_js
    assert '/api/v5/browser/linkgrabber/pending' in app
    assert 'switchView("grabber")' in app
