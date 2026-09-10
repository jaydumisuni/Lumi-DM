from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def test_samsung_resolver_uses_existing_firmware_table_and_protected_stage_route():
    src=(ROOT/"static"/"technician-workspaces.js").read_text(encoding="utf-8")
    assert 'item.metadata?.resolver === "samsung-fus"' in src
    assert 'data-firmware-action="resolve-samsung"' in src
    assert '"/api/v5/firmware/samsung/stage"' in src
    assert 'Samsung CSC' in src
    assert '/api/downloads/${encodeURIComponent(task.id)}/confirm' in src

def test_samsung_postprocess_is_installed_after_wave3_runtime_activation():
    server=(ROOT/"server.py").read_text(encoding="utf-8")
    assert 'from core.v3.api import wave3_api' in server
    assert 'from core.v5.samsung_postprocess import install_samsung_postprocess' in server
    assert server.index('install_samsung_postprocess()') < server.index('install_os_api()')
