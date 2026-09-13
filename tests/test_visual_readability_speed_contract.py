from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def test_old_techguy_background_is_gone_and_lumi_background_is_authority():
    assert not (ROOT/'static'/'background.png').exists()
    assert (ROOT/'static'/'lumi-background.png').exists()
    for rel in ['static/technician-workspaces.css','static/lumi-approved-ui.css','static/lumi-glass-material.css']:
        text=(ROOT/rel).read_text(encoding='utf-8')
        assert '/static/background.png' not in text
        assert '/static/lumi-background.png' in text

def test_main_speed_test_uses_one_centered_progress_result_card():
    ui=(ROOT/'static'/'approved-mockup-ui.js').read_text(encoding='utf-8')
    css=(ROOT/'static'/'approved-mockup-ui.css').read_text(encoding='utf-8')
    assert 'approved-speed-card' in ui
    assert 'approved-speed-activity' in ui
    assert 'Testing internet speed' in ui
    assert 'Testing connection capacity' not in ui
    assert 'approved-speed-drawer' not in ui
    assert '.approved-control-overlay.speed{display:grid;place-items:center}' in css

def test_readability_baseline_raises_small_ui_copy():
    css=(ROOT/'static'/'approved-mockup-ui.css').read_text(encoding='utf-8')
    assert 'LUMI READABILITY BASELINE' in css
    assert '.approved-page{font-size:10.5px' in css
    assert '.approved-page-head p{font-size:10px' in css
    assert '.approved-support-cards small{font-size:10px' in css
    assert '.approved-settings-card label{font-size:10px' in css
    widget=(ROOT/'electron'/'widget.html').read_text(encoding='utf-8')
    assert 'LUMI WIDGET READABILITY' in widget
