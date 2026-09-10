from core.v5 import firmware


def test_xfu_release_requires_github_sha256_and_keeps_community_provenance():
    release = {
        "tag_name": "stable-25.08.2026",
        "name": "stable-25.08.2026",
        "html_url": "https://github.com/XiaomiFirmwareUpdaterReleases/firmware_xiaomi_spinel/releases/tag/stable-25.08.2026",
        "published_at": "2026-08-25T00:37:00Z",
        "body": "Extracted Firmware from HyperOS OS3.0.302.0.WPGMIXM",
        "assets": [
            {"name": "fw_spinel_miui_SPINELGlobal_OS3.0.302.0.WPGMIXM.zip", "browser_download_url": "https://github.com/XiaomiFirmwareUpdaterReleases/firmware_xiaomi_spinel/releases/download/stable-25.08.2026/fw.zip", "size": 1234, "digest": "sha256:" + "a" * 64},
            {"name": "unverified.zip", "browser_download_url": "https://github.com/example/unverified.zip", "size": 10, "digest": None},
        ],
    }
    results = firmware._parse_xfu_release(release, brand="POCO", device="spinel", codename="spinel")
    assert len(results) == 1
    item = results[0]
    assert item.official is False and item.direct is True
    assert item.sha256 == "a" * 64
    assert item.version == "OS3.0.302.0.WPGMIXM"
    assert item.release_date == "2026-08-25"
    assert item.metadata["community_index"] is True
    assert item.metadata["artifact_claim"] == "extracted from official MIUI/HyperOS ROM"


def test_xfu_repo_name_uses_safe_device_codename_only():
    assert firmware._xfu_repo_name("spinel") == "firmware_xiaomi_spinel"
    assert firmware._xfu_repo_name("lisa") == "firmware_xiaomi_lisa"
    assert firmware._xfu_repo_name("../../oops") == ""
    assert firmware._xfu_repo_name("SM-A145F") == ""


def test_xfu_provider_is_not_labeled_official_xiaomi():
    provider = next(item for item in firmware.providers() if item["id"] == "xiaomi-firmware-updater")
    assert provider["official"] is False
    assert provider["direct_files"] is True
    assert set(provider["brands"]) == {"Xiaomi", "Redmi", "POCO"}


def test_github_release_fetch_has_bounded_curl_fallback(monkeypatch):
    class BrokenSession:
        headers = {}
        def get(self, *args, **kwargs): raise RuntimeError("python transport down")
    class Done:
        returncode = 0
        stdout = '{"tag_name":"stable","assets":[]}'
        stderr = ''
    monkeypatch.setattr(firmware.requests, "Session", lambda: BrokenSession())
    monkeypatch.setattr(firmware.shutil, "which", lambda name: "/usr/bin/curl" if name == "curl" else None)
    monkeypatch.setattr(firmware.subprocess, "run", lambda *a, **k: Done())
    value = firmware._github_release_json("https://api.github.com/repos/o/r/releases/latest")
    assert value["tag_name"] == "stable"


def test_xfu_version_and_region_are_bound_to_each_asset_filename():
    release={"tag_name":"stable-25.08.2026","published_at":"2026-08-25T00:37:00Z","body":"Extracted Firmware from HyperOS OS3.0.302.0.WPGMIXM","html_url":"https://github.com/x/y/releases/tag/z","assets":[
      {"name":"fw_spinel_spinel_eea_global-ota_full-OS3.0.301.0.WPGEUXM-user-16.0-x.zip","browser_download_url":"https://github.com/x/y/a.zip","size":1,"digest":"sha256:"+"1"*64},
      {"name":"fw_spinel_spinel_global-ota_full-OS3.0.302.0.WPGMIXM-user-16.0-y.zip","browser_download_url":"https://github.com/x/y/b.zip","size":1,"digest":"sha256:"+"2"*64}] }
    values=firmware._parse_xfu_release(release,brand="POCO",device="spinel",codename="spinel")
    assert [(v.version,v.metadata["region"]) for v in values]==[("OS3.0.301.0.WPGEUXM","EEA"),("OS3.0.302.0.WPGMIXM","Global")]
