from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = (ROOT / "electron" / "main.js").read_text(encoding="utf-8")
MATERIAL = (ROOT / "static" / "lumi-glass-material.css").read_text(encoding="utf-8")

def test_main_window_uses_controlled_glass_foundation():
    block = MAIN[MAIN.index("mainWindow = new BrowserWindow({"):MAIN.index("mainWindow.setMenuBarVisibility", MAIN.index("mainWindow = new BrowserWindow({"))]
    assert "frame: false" in block
    assert 'backgroundColor: "#070b14"' in block
    assert "transparent: true" not in block
    assert "backgroundMaterial:" not in block

def test_material_uses_reference_glass_visual_lock():
    assert "/* Visual target lock" in MATERIAL
    assert "url('/static/lumi-background.png')" in MATERIAL
    assert "filter:saturate(1.55) brightness(.95) blur(3px)!important" in MATERIAL
    assert "backdrop-filter:blur(12px) saturate(154%)" in MATERIAL
    assert "backdrop-filter:blur(14px) saturate(128%)" in MATERIAL
    assert "body.ttg-desktop::before" in MATERIAL
    assert "border-bottom:0!important" in MATERIAL
