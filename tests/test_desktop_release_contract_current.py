from pathlib import Path
import json


ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "static"


def read_static(name: str) -> str:
    return (STATIC / name).read_text(encoding="utf-8")


def test_current_builder_profile_is_builder_owned_and_cross_platform():
    config = json.loads((ROOT / "techguy-build.json").read_text(encoding="utf-8"))
    assert config["appName"] == "Lumi DM"
    assert config["appVersion"] == "1.0.0"
    assert config["projectType"] == "multi-platform-source"
    assert config["entryFile"] == "electron/main.js"
    assert config["repository"] == "jaydumisuni/Lumi-DM"
    assert config["electron"]["builderOwnsPackaging"] is True
    assert config["electron"]["sourceRoot"] == "electron"
    assert config["electron"]["electronBuilderVersion"].startswith("^26.")
    assert config["sourceBoundary"]["containsBuildEnvironment"] is False
    assert config["sourceBoundary"]["builderRepository"] == "jaydumisuni/thetechguy-software-builder"
    assert not (ROOT / "electron" / "package.json").exists()


def test_current_sidecar_contract_is_builder_generated():
    config = json.loads((ROOT / "techguy-build.json").read_text(encoding="utf-8"))
    sidecar = config["electron"]["pythonSidecars"][0]
    assert sidecar["entry"] == "server.py"
    assert sidecar["python"] == "3.13"
    assert sidecar["name"] == "LUMIDM-server"
    assert sidecar["output"] == "dist/server"
    assert "libtorrent==2.0.13" in sidecar["extraRequirements"]
    assert any(item.startswith("imageio-ffmpeg") for item in sidecar["extraRequirements"])
    assert config["output"]["dist"] == "dist/electron"


def test_current_linux_and_windows_icons_are_explicit_verified_assets():
    config = json.loads((ROOT / "techguy-build.json").read_text(encoding="utf-8"))
    brand = json.loads((ROOT / "assets" / "branding-manifest.json").read_text(encoding="utf-8"))
    generated = brand["generated_identity_assets_sha256"]
    assert config["logo"] == "static/favicon-96.png"
    assert config["icon"] == "static/favicon-512.png"
    assert config["icons"]["windows"] == "assets/windows/Lumi-DM.ico"
    assert config["icons"]["linux"] == "static/favicon-512.png"
    for relative in (config["logo"], config["icon"], *config["icons"].values()):
        assert (ROOT / relative).is_file(), relative
        assert relative in generated, relative


def test_core_renderer_has_all_static_form_modal_and_inspector_bindings():
    app = read_static("app.js")
    required = [
        'document.getElementById("content")?.addEventListener("click", handleContentClick)',
        'document.getElementById("content")?.addEventListener("submit", handleContentSubmit)',
        'document.getElementById("source-tabs")?.addEventListener("click"',
        'document.getElementById("source-body")?.addEventListener("click", handleSourceClick)',
        'document.getElementById("source-body")?.addEventListener("submit", handleSourceSubmit)',
        'document.getElementById("queue-form")?.addEventListener("submit", createQueue)',
        'document.getElementById("category-form")?.addEventListener("submit", createCategory)',
        'document.getElementById("inspector-tabs")?.addEventListener("click"',
        'document.getElementById("inspector-body")?.addEventListener("click", event =>',
        'document.getElementById("inspector-body")?.addEventListener("submit", handleInspectorSubmit)',
    ]
    for binding in required:
        assert binding in app


def test_release_controls_remain_locked_to_custom_builder_and_github_releases():
    config = json.loads((ROOT / "techguy-build.json").read_text(encoding="utf-8"))
    installer = config["installer"]
    assert installer["requireCustomGraphicalInstaller"] is True
    assert installer["rejectVendorInstallerArtifacts"] is True
    assert installer["requireRegisteredUninstall"] is True
    assert config["distribution"]["publicDownloads"] == "github-releases-only"
    assert config["githubRelease"]["generateSha256Sidecars"] is True
    assert config["githubRelease"]["tokenStoredInProject"] is False
