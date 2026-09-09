from pathlib import Path
import hashlib

ROOT = Path(__file__).resolve().parents[1]
CSS = (ROOT / "static" / "lumi-glass-material.css").read_text(encoding="utf-8")
EXPECTED_BACKGROUND_SHA256 = "4d55bf99c2ea24671b364d9f422a64149825238205ef7ea53d9c655424e7fae1"

def test_supplied_background_is_exact_chat_attachment():
    asset = ROOT / "static" / "lumi-background.png"
    assert asset.is_file()
    assert hashlib.sha256(asset.read_bytes()).hexdigest() == EXPECTED_BACKGROUND_SHA256
    assert "/static/lumi-background.png" in CSS

def test_reference_skin_uses_outer_luminous_perimeter_not_inner_top_divider():
    assert "body.ttg-desktop::before" in CSS
    assert "#app-shell::before{content:none!important}" in CSS
    assert "border-bottom:0!important" in CSS
    assert "#55dfff" in CSS and "#d65cff" in CSS

def test_reference_skin_final_lock_has_real_smoked_and_frosted_glass():
    assert "/* Visual target lock" in CSS
    assert "backdrop-filter:blur(12px) saturate(154%)" in CSS
    assert "backdrop-filter:blur(14px) saturate(128%)" in CSS
    assert "radial-gradient(circle at 0 0,rgba(38,147,255,.115)" in CSS
    assert "radial-gradient(circle at 100% 100%,rgba(184,55,255,.095)" in CSS
    assert "background:rgba(7,17,39,.36)!important" in CSS
    assert "background:rgba(249,252,255,.50)!important" in CSS
