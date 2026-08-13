import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_desktop_packaging_uses_current_windows_builder_and_explicit_icons():
    config = json.loads((ROOT / "techguy-build.json").read_text(encoding="utf-8"))
    electron = config["electron"]
    icons = config["icons"]

    assert electron["electronBuilderVersion"] == "^26.11.1"
    assert icons["windows"] == "assets/windows/Lumi-DM.ico"
    assert icons["linux"] == "static/favicon-512.png"
    assert (ROOT / icons["windows"]).is_file()
    assert (ROOT / icons["linux"]).is_file()


def test_browser_extension_does_not_block_first_launch():
    shell = (ROOT / "static" / "main-ui-shell.js").read_text(encoding="utf-8")
    start = shell.index("function maybeShowExtensionNotice()")
    end = shell.index("function showExtensionNotice", start)
    body = shell[start:end]

    assert "setTimeout" not in body
    assert "showExtensionNotice(true)" not in body
    assert "if (action === \"extension\") return showExtensionNotice(false);" in shell
