from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_native_manager_forces_one_to_one_device_scale_before_window_creation():
    source = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")
    marker = 'app.commandLine.appendSwitch("force-device-scale-factor", "1")'
    assert marker in source
    assert source.index(marker) < source.index("app.whenReady()")
    assert source.index(marker) < source.index("new BrowserWindow({")
