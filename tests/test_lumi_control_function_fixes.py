from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_connection_capacity_uses_cloudflare_accepted_sample_ceiling():
    source = (ROOT / "electron" / "connection-capacity.js").read_text(encoding="utf-8")
    assert "15_000_000" not in source
    assert "10_000_000" in source


def test_updater_treats_missing_latest_release_as_normal_empty_release_state():
    source = (ROOT / "electron" / "update-manager.js").read_text(encoding="utf-8")
    assert "error.statusCode = status" in source
    assert "error.statusCode === 404" in source
    assert "No published Lumi release is available yet." in source
