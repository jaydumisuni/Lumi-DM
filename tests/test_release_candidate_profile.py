from __future__ import annotations

import json
from pathlib import Path
import sys
from types import SimpleNamespace

from core.v3 import executables


ROOT = Path(__file__).resolve().parents[1]


def test_builder_profile_matches_lumi_release_contract():
    config = json.loads((ROOT / "techguy-build.json").read_text(encoding="utf-8"))
    assert config["appName"] == "Lumi DM"
    assert config["appVersion"] == "1.0.0"
    assert config["projectType"] == "multi-platform-source"
    assert config["repository"] == "jaydumisuni/Lumi-DM"
    assert config["entryFile"] == "electron/main.js"
    assert config["electron"]["builderOwnsPackaging"] is True
    assert config["electron"]["sourceRoot"] == "electron"
    assert config["electron"]["electronBuilderVersion"].startswith("^26.")
    assert not (ROOT / "electron" / "package.json").exists()
    assert config["installer"]["runAsAdmin"] is True
    assert config["installer"]["desktopShortcutChecked"] is True
    assert config["installer"]["startMenuShortcutChecked"] is True
    assert config["installer"]["requireCustomGraphicalInstaller"] is True
    assert config["installer"]["rejectVendorInstallerArtifacts"] is True
    assert config["installer"]["requireRegisteredUninstall"] is True
    assert config["githubRelease"]["tag"] == "v1.0.0"
    assert config["githubRelease"]["generateSha256Sidecars"] is True
    assert config["githubRelease"]["tokenStoredInProject"] is False


def test_builder_sidecar_matches_electron_extra_resources():
    config = json.loads((ROOT / "techguy-build.json").read_text(encoding="utf-8"))
    sidecar = config["electron"]["pythonSidecars"][0]
    assert sidecar["entry"] == "server.py"
    assert sidecar["name"] == "LUMIDM-server"
    assert sidecar["output"] == "dist/server"
    assert "libtorrent==2.0.13" in sidecar["extraRequirements"]
    assert any(item.startswith("imageio-ffmpeg") for item in sidecar["extraRequirements"])
    assert config["electron"]["builderOwnsPackaging"] is True
    assert config["output"]["dist"] == "dist/electron"
    for relative in ("electron", "static", "Resouces", "assets", "browser-extension"):
        assert (ROOT / relative).exists(), relative
    assert not (ROOT / "electron" / "package.json").exists()


def test_ffmpeg_falls_back_to_packaged_imageio_binary(monkeypatch, tmp_path):
    binary = tmp_path / "ffmpeg.exe"
    binary.write_bytes(b"ffmpeg")
    monkeypatch.setattr(executables, "find_executable", lambda *args, **kwargs: None)
    monkeypatch.setitem(
        sys.modules,
        "imageio_ffmpeg",
        SimpleNamespace(get_ffmpeg_exe=lambda: str(binary)),
    )
    assert executables.find_ffmpeg() == str(binary)


def test_7zip_remains_optional_in_release_profile():
    config = json.loads((ROOT / "techguy-build.json").read_text(encoding="utf-8"))
    sevenzip = next(item for item in config["dependencies"] if item["id"] == "sevenzip")
    assert sevenzip["kind"] == "sevenzip"
    assert sevenzip["required"] is False


def test_installed_extension_uses_auto_trust_and_quiet_browser_fallback():
    manifest = json.loads((ROOT / "browser-extension" / "manifest.json").read_text(encoding="utf-8"))
    background = (ROOT / "browser-extension" / "background.js").read_text(encoding="utf-8")
    popup = (ROOT / "browser-extension" / "popup.html").read_text(encoding="utf-8")

    assert manifest["background"]["service_worker"] == "background.js"
    assert manifest["action"]["default_popup"] == "popup.html"
    assert manifest["content_scripts"][0]["js"] == ["content-v2.js"]
    assert "cookies" not in manifest["permissions"]
    assert "webRequest" not in manifest["permissions"]
    assert 'mode: "local_extension"' in background
    assert "await safePause(item.id)" in background
    assert "if (!handoffId) throw new Error" in background
    assert "No pause occurred if persistence failed" in background
    assert "Automatic local trust" in popup
    assert 'id="pair-code"' not in popup

    for obsolete in (
        "popup-security.js", "security-shim.js", "popup-native-handoff.js",
        "browser-bridge.js", "notification-guard.js", "content-safety.js",
    ):
        assert not (ROOT / "browser-extension" / obsolete).exists()


def test_release_candidate_has_no_builder_environment_inside_project():
    forbidden = [ROOT / ".venv", ROOT / "venv", ROOT / "node_modules"]
    assert not any(path.exists() for path in forbidden)
