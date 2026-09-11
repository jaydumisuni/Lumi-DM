from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_manager_taskbar_exists_only_while_full_manager_is_shown():
    source = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")
    assert "function hideMainToTray()" in source
    assert "mainWindow.setSkipTaskbar(true)" in source
    assert "mainWindow.setSkipTaskbar(false)" in source
    assert 'mainWindow.on("minimize"' in source
    assert 'mainWindow.on("close"' in source
    assert "hideMainToTray();" in source
    assert "showWidget();" in source


def test_widget_never_owns_a_taskbar_button():
    source = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")
    widget = source[source.index("function createWidget()"):source.index("function showWidget()")]
    assert "skipTaskbar: true" in widget


def test_hidden_startup_manager_is_taskbar_hidden_until_restored():
    source = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")
    main = source[source.index("function createMainWindow"):source.index("function broadcastWindowState")]
    assert "skipTaskbar: Boolean(startHidden)" in main
    assert "mainWindow.setSkipTaskbar(false)" in main
