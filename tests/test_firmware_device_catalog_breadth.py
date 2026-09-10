from __future__ import annotations

import json
from urllib.parse import quote_plus

from core.v5 import firmware


def test_google_play_catalog_maps_priority_oems_and_model_identity():
    csv_text = "\ufeffRetail Branding,Marketing Name,Device,Model\n" + "\n".join([
        "Samsung,Galaxy A14,a14x,SM-A145F",
        "Tecno Mobile,CAMON 30,CL6,CL6",
        "Itel,S23,S665L,S665L",
        "Huawei,P40,ANA-NX9,ANA-NX9",
        "Honor,Magic6,bvl-an00,BVL-AN00",
        "ZTE,nubia Neo 3,NP03J,Z2461",
        "nubia,REDMAGIC 10,NX789J,NX789J",
    ])
    index = firmware._parse_google_play_device_index(csv_text)
    assert index["Samsung"][0].id == "SM-A145F"
    assert index["Samsung"][0].codename == "a14x"
    assert {item.brand for item in index["Tecno"]} == {"Tecno"}
    assert {item.brand for item in index["itel"]} == {"itel"}
    assert {item.brand for item in index["Huawei"]} == {"Huawei"}
    assert {item.brand for item in index["Honor"]} == {"Honor"}
    assert len(index["ZTE / Nubia"]) == 2
    assert all(item.provider == "google-play-catalog" for values in index.values() for item in values)


def test_lineage_wiki_catalog_parser_recovers_codename_and_support_evidence():
    payload = {
        "a21s": {
            "vendor": "Samsung", "name": "Galaxy A21s", "codename": "a21s",
            "models": ["SM-A217F", "SM-A217M"], "maintainers": ["Maintainer"],
            "current_branch": 23.2,
        },
        "lisa": {
            "vendor": "Xiaomi", "name": "11 Lite 5G NE", "codename": "lisa",
            "models": ["2109119DG"], "maintainers": [], "current_branch": 22.2,
        },
    }
    encoded = quote_plus(json.dumps(payload, separators=(",", ":")))
    page = f"DEVICES = JSON.parse(\n  decodeURIComponent('{encoded}'.replaceAll('+', ' '))\n);"
    index = firmware._parse_lineage_device_index(page)
    samsung = index["Samsung"][0]
    assert samsung.id == "a21s"
    assert samsung.codename == "a21s"
    assert samsung.metadata["models"] == ["SM-A217F", "SM-A217M"]
    assert samsung.supported is True
    xiaomi = index["Xiaomi"][0]
    assert xiaomi.supported is False


def test_canonical_brand_mapping_matches_locked_firmware_brand_names():
    pairs = {
        "TECNO Mobile": "Tecno", "Itel": "itel", "HUAWEI": "Huawei",
        "HONOR": "Honor", "nubia": "ZTE / Nubia", "ZTE": "ZTE / Nubia",
        "HMD": "Nokia / HMD", "OPPO": "Oppo", "realme": "Realme",
    }
    for raw, expected in pairs.items():
        assert firmware._canonical_brand(raw) == expected
