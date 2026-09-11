from __future__ import annotations

import json
from pathlib import Path


def test_native_widget_authenticates_before_api_polling_and_is_packaged() -> None:
    root = Path(__file__).resolve().parents[1]
    main = (root / "electron" / "main.js").read_text(encoding="utf-8")
    runtime_auth = (root / "electron" / "runtime-http-auth.js").read_text(encoding="utf-8")
    config = json.loads((root / "techguy-build.json").read_text(encoding="utf-8"))

    assert 'require("./runtime-http-auth")' in main
    assert main.index('require("./runtime-http-auth")') < main.index('require("./server-supervisor")')
    assert '["127.0.0.1", "localhost", "::1"].includes(hostname)' in runtime_auth
    assert 'port === 7000' in runtime_auth
    assert '"X-Lumi-Desktop-Secret"' in runtime_auth
    assert 'http.get = function lumiGet' in runtime_auth
    assert config["electron"]["builderOwnsPackaging"] is True
    for filename in ("runtime-http-auth.js", "main.js", "preload-widget.js"):
        assert (root / "electron" / filename).is_file()
    assert not (root / "electron" / "package.json").exists()


def test_native_session_cookie_is_scoped_to_loopback_lumi_port() -> None:
    root = Path(__file__).resolve().parents[1]
    session = (root / "electron" / "native-session.js").read_text(encoding="utf-8")

    assert '["127.0.0.1", "localhost", "::1"].includes(host)' in session
    assert "port === 7000" in session
    assert 'route !== "/api/security/bootstrap"' in session


def test_old_widget_clipboard_and_staged_manager_paths_are_absent() -> None:
    root = Path(__file__).resolve().parents[1]
    main = (root / "electron" / "main.js").read_text(encoding="utf-8")
    surfaces = (root / "electron" / "roadmap-surfaces.js").read_text(encoding="utf-8")
    preload = (root / "electron" / "preload-widget.js").read_text(encoding="utf-8")
    config = json.loads((root / "techguy-build.json").read_text(encoding="utf-8"))
    source_files = {item.name for item in (root / "electron").iterdir() if item.is_file()}

    for obsolete in (
        "checkClipboard", "showMainWindowForStaged",
        "widgetWindow = new BrowserWindow({\n    width: 220, height: 60",
        "Reminal Download Manager", "legacy-guards-v5.js", "bootstrap-v5.js",
    ):
        assert obsolete not in main
        assert obsolete not in source_files
    assert 'window.webContents.send("v7-browser-pending", task || null)' in surfaces
    assert "v7-widget-confirm" in preload
    assert "v7-widget-release" in preload
    assert "v7-browser-pending" in preload
    assert config["electron"]["builderOwnsPackaging"] is True
    assert not (root / "electron" / "package.json").exists()
