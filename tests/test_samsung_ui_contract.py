from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def test_samsung_resolver_is_not_exposed_as_a_fake_download_row():
    src=(ROOT/"static"/"technician-workspaces.js").read_text(encoding="utf-8")
    assert 'data-firmware-action="resolve-samsung"' not in src
    assert 'data-firmware-action="source"' not in src

def test_samsung_postprocess_is_installed_after_wave3_runtime_activation():
    server=(ROOT/"server.py").read_text(encoding="utf-8")
    assert 'from core.v3.api import wave3_api' in server
    assert 'from core.v5.samsung_postprocess import install_samsung_postprocess' in server
    assert server.index('install_samsung_postprocess()') < server.index('install_os_api()')
