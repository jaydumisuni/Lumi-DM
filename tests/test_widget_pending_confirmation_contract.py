from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_existing_widget_owns_pending_confirmation_surface():
    html = read("electron/widget.html")
    for marker in (
        'id="pending-confirmation"',
        'id="pending-filename"',
        'id="pending-target-dir"',
        'id="pending-size"',
        'id="pending-source"',
        'id="pending-duplicate"',
        'data-pending-action="browse"',
        'data-pending-action="now"',
        'data-pending-action="later"',
        'data-pending-action="cancel"',
    ):
        assert marker in html


def test_widget_preload_exposes_pending_confirmation_ipc():
    preload = read("electron/preload-widget.js")
    for marker in (
        "ipcRenderer.invoke('v7-widget-pending')",
        "ipcRenderer.invoke('v7-widget-confirm'",
        "ipcRenderer.invoke('v7-widget-release'",
        "ipcRenderer.on('v7-browser-pending'",
    ):
        assert marker in preload


def test_pending_capture_does_not_fall_back_to_queued_tab():
    surface = read("electron/roadmap-surfaces.js")
    assert 'document.querySelector(\'[data-tab="queued"]\')?.click()' not in surface
    assert 'window.webContents.send("v7-browser-pending", task || null)' in surface
