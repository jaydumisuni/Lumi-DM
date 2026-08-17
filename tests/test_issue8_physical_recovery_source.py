from pathlib import Path

from core.v7.media_resolver import discover_media

ROOT = Path(__file__).resolve().parents[1]


def test_electron_main_has_one_runtime_surface_path() -> None:
    main = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")
    assert 'require("./runtime-http-auth")' in main
    assert 'require("./window-contract")' in main
    assert 'require("./native-session")' not in main
    assert "loadFile(staticIndex)" not in main
    assert 'loadFile(runtimeErrorPath())' in main
    assert 'loadURL(API_ORIGIN)' in main


def test_browser_handoff_does_not_create_second_confirmation_window() -> None:
    main = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")
    assert "setupWindow" not in main
    assert "showSetupPopup" not in main
    assert "scanPendingSetups" not in main
    assert "v5-setup-confirm" not in main
    assert "v5-setup-browser" not in main
    assert "v5-setup-cancel" not in main
    assert "confirm.html" not in main
    surfaces = (ROOT / "electron" / "roadmap-surfaces.js").read_text(encoding="utf-8")
    assert "No confirmation window or second app identity is created" in surfaces
    assert 'window.webContents.send("v7-browser-pending"' in surfaces


def test_runtime_recovery_surface_is_self_contained() -> None:
    page = (ROOT / "electron" / "runtime-error.html").read_text(encoding="utf-8")
    assert "Local Runtime is recovering" in page
    assert "No fallback application has been started" in page
    assert "/static/" not in page
    assert "<script" not in page.lower()


def test_explicit_source_quality_beats_parent_video_dimensions() -> None:
    result = discover_media({
        "url": "",
        "resolver_fallback": False,
        "observations": [
            {
                "kind": "direct",
                "url": "https://fixture.test/video-1080p.mp4",
                "height": 360,
                "label": "360p page video",
            },
            {
                "kind": "direct",
                "url": "https://fixture.test/video-720p.mp4",
                "height": 360,
                "label": "360p page video",
            },
            {
                "kind": "direct",
                "url": "https://fixture.test/video-360p.mp4",
                "height": 360,
                "label": "360p page video",
            },
        ],
    })

    assert result["state"] == "variants_found"
    assert [item["height"] for item in result["variants"]] == [1080, 720, 360]
    assert [item["label"] for item in result["variants"]] == ["1080p", "720p", "360p"]
    assert all(item["container"] == "mp4" for item in result["variants"])
