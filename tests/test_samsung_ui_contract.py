from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def test_samsung_uses_same_visible_download_action_as_other_firmware():
    src=(ROOT/"static"/"technician-workspaces.js").read_text(encoding="utf-8")
    active=(ROOT/"static"/"roadmap-corrections.js").read_text(encoding="utf-8")
    assert 'data-firmware-action="resolve-samsung"' not in src
    assert 'data-firmware-action="download"' in src
    assert 'item.metadata?.resolver === "samsung-fus"' in src
    assert '"/api/v5/firmware/samsung/stage"' in src
    assert 'Downloadable' not in src
    assert 'filter(isActionableFirmware)' in active
    assert 'All available sources' not in active
    assert 'All sources' in active

def test_samsung_postprocess_is_installed_after_wave3_runtime_activation():
    server=(ROOT/"server.py").read_text(encoding="utf-8")
    assert 'from core.v3.api import wave3_api' in server
    assert 'from core.v5.samsung_postprocess import install_samsung_postprocess' in server
    assert server.index('install_samsung_postprocess()') < server.index('install_os_api()')
