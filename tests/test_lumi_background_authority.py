from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def test_only_approved_lumi_background_is_live():
    assert (ROOT / "static/lumi-background.png").is_file()
    assert not (ROOT / "static/background.png").exists()
    css = "\n".join(path.read_text(encoding="utf-8", errors="ignore") for path in (ROOT / "static").glob("*.css"))
    assert "/static/background.png" not in css
    assert "/static/lumi-background.png" in css
    sw = (ROOT / "static/sw.js").read_text(encoding="utf-8")
    assert "'/static/lumi-background.png'" in sw
