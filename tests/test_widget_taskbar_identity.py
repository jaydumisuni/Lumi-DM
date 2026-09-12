from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _slice(source: str, start: str, end: str) -> str:
    return source[source.index(start):source.index(end, source.index(start))]


def test_widget_creation_has_no_taskbar_identity_and_uses_lumi_icon_fallback():
    source = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")
    widget = _slice(source, "function createWidget()", "function showWidget()")
    assert "skipTaskbar: true" in widget
    assert "icon: iconPath()" in widget
    assert "widgetWindow.setSkipTaskbar(true)" in widget


def test_widget_resize_reasserts_skip_taskbar_after_focusability_changes():
    source = (ROOT / "electron" / "roadmap-surfaces.js").read_text(encoding="utf-8")
    resize = _slice(source, "function resizeAnchored", "function effectiveExpanded")
    assert "window.setSkipTaskbar(true)" in resize
    assert resize.index("window.setFocusable(expand)") < resize.rindex("window.setSkipTaskbar(true)")
