from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def _font_size(css: str, selector: str) -> int:
    match = re.search(re.escape(selector) + r"\{[^}]*font-size:(\d+)px", css)
    assert match, selector
    return int(match.group(1))


def test_functional_text_has_no_global_glass_shadow():
    css = (ROOT / "static" / "lumi-glass-material.css").read_text(encoding="utf-8")
    assert ':is(.approved-page,.lumi-overview,.lumi-page,.nav-item,.nav-subitem,.ttg-shell-menu,button,label,input,select,textarea){text-shadow:none!important}' in css


def test_about_copy_uses_crisp_readable_minimum_sizes():
    css = (ROOT / "static" / "approved-mockup-ui.css").read_text(encoding="utf-8")
    assert _font_size(css, '.approved-about-kicker') >= 9
    assert _font_size(css, '.approved-about-frame>p') >= 9
    assert _font_size(css, '.approved-about-meta') >= 9
    assert _font_size(css, '.approved-about-frame footer') >= 8
