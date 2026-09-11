from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_ttg_shell_is_created_directly_by_lumi_main_process():
    source = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")
    assert 'frame: false' in source
    assert 'title: "Lumi DM"' in source
    assert 'preload: path.join(__dirname, "preload-main.js")' in source
    assert 'electron.BrowserWindow =' not in source
    assert 'Object.defineProperty(electron, "BrowserWindow"' not in source
    assert "Module._load" not in source
    assert "Reminal Download Manager" not in source


def test_custom_builder_uses_unpacked_payload_not_stock_nsis_installer():
    config = json.loads((ROOT / "techguy-build.json").read_text(encoding="utf-8"))
    assert config["entryFile"] == "electron/main.js"
    assert config["projectType"] == "multi-platform-source"
    assert config["electron"]["builderOwnsPackaging"] is True
    assert config["electron"]["sourceRoot"] == "electron"
    assert set(config["targets"]) >= {"windows-exe", "windows-installer"}
    assert not (ROOT / "electron" / "package.json").exists()
    assert config["installer"]["requireCustomGraphicalInstaller"] is True
    assert config["installer"]["rejectVendorInstallerArtifacts"] is True
    assert config["installer"]["requireRegisteredUninstall"] is True
