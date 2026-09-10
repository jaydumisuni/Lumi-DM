from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_lineage_provider_requires_exact_device_support_evidence():
    source = (ROOT / "static" / "roadmap-corrections.js").read_text(encoding="utf-8")
    assert 'if (provider.id === "lineageos") return exactProviders.has("lineageos");' in source


def test_identity_only_google_catalog_is_not_exposed_as_firmware_provider():
    source = (ROOT / "core" / "v5" / "firmware.py").read_text(encoding="utf-8")
    providers_block = source[source.index("_PROVIDERS = ["):source.index("_BRANDS = [")]
    assert 'id="google-play-catalog"' not in providers_block
