from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]


def test_packaged_runtime_listens_for_lan_pairing_but_local_ui_stays_loopback():
    supervisor=(ROOT/'electron'/'server-supervisor.js').read_text(encoding='utf-8')
    main=(ROOT/'electron'/'main.js').read_text(encoding='utf-8')
    assert 'LUMIDM_LAN_PAIRING === "0" ? "127.0.0.1" : "0.0.0.0"' in supervisor
    assert 'hostname: "127.0.0.1"' in supervisor
    assert 'http://127.0.0.1:7000' in main or '127.0.0.1:7000' in supervisor


def test_approved_settings_exposes_both_pairing_directions():
    settings=(ROOT/'static'/'main-ui-settings.js').read_text(encoding='utf-8')
    app=(ROOT/'static'/'app.js').read_text(encoding='utf-8')
    assert 'Pair this Lumi' in settings
    assert 'Connect to another Lumi' in settings
    assert 'data-form="pair-lumi-target"' in settings
    assert '/api/v7/devices/pairing' in app
    assert '/api/v7/devices/pair' in app
    assert '/api/v7/devices' in app
    assert 'remove-paired-target' in app


def test_remote_contract_routes_nonlocal_destination_instead_of_creating_second_engine():
    source=(ROOT/'core'/'v7'/'remote_contract.py').read_text(encoding='utf-8')
    assert '_rpc_to_target(registry, destination, "download.request", data)' in source
    assert 'return original(app_value, "download.create", data)' in source
    assert 'same_device_tool_bootstrap' in source
