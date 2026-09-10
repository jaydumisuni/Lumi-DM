from core.v5 import firmware


def test_current_lineage_build_shape_yields_checksum_backed_artifacts():
    raw = [{
        "date": "2026-09-09",
        "datetime": 1788931263,
        "type": "nightly",
        "version": "22.2",
        "files": [
            {"filename": "lineage-22.2-20260909-nightly-enchilada-signed.zip", "url": "https://mirrorbits.lineageos.org/full/enchilada/20260909/lineage.zip", "sha256": "a" * 64, "size": 1000, "type": "nightly"},
            {"filename": "boot.img", "url": "https://mirrorbits.lineageos.org/full/enchilada/20260909/boot.img", "sha256": "b" * 64, "size": 100},
        ],
    }]
    results = firmware._parse_lineage_builds(raw, "enchilada", "all")
    assert len(results) == 2
    rom = next(item for item in results if item.filename.endswith(".zip"))
    boot = next(item for item in results if item.filename == "boot.img")
    assert rom.official is True and rom.direct is True
    assert rom.version == "22.2" and rom.channel == "nightly"
    assert rom.sha256 == "a" * 64 and rom.size == 1000
    assert rom.release_date == "2026-09-09"
    assert rom.file_type == "ROM"
    assert boot.file_type == "boot image"
    assert boot.sha256 == "b" * 64


def test_lineage_channel_filter_applies_to_nested_builds():
    raw = [{"date": "2026-09-09", "type": "nightly", "version": "22.2", "files": [{"filename": "rom.zip", "url": "https://mirrorbits.lineageos.org/rom.zip", "sha256": "c" * 64}]}]
    assert firmware._parse_lineage_builds(raw, "enchilada", "stable") == []
    assert len(firmware._parse_lineage_builds(raw, "enchilada", "nightly")) == 1
