#!/usr/bin/env python3
"""Prove the real Windows Electron window uses the exact approved renderer."""
from __future__ import annotations

import json
from pathlib import Path
import subprocess

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CAPTURES = ROOT / "artifacts" / "electron-visual"

EXPECTED_BLOBS = {
    "static/index.html": "bcbb73feb7c47b5fff5ea6d9554857bf23371b65",
    "static/lumi-approved-ui.css": "efc49d4383731ee41e94c1e66df09ffdd6e357d7",
    "static/lumi-approved-ui.js": "e8d5503b079a7cd5ad6d115e11ef6994b84e4f00",
    "static/assets/lumi-brand-transparent.png": "b452526c486fa2962ab05478a1f3a66bf67fb8d8",
}

REFERENCE_DHASH = {
    "01_Overview": "2a6490ac914c32488b2eb1e43162b650b052946792adb1ca516a916a346a8159",
    "02_All_Downloads": "23249098926d326c8936b2853245b316b156b126918cb18c51d8d1d8339c986c",
    "03_Unfinished": "2b7490b3924c324c992407583552b153b152b45395539553345394321152931a",
    "04_Finished": "227490939b6c3364993632c8325ab356b146b05693163356515693163146b106",
    "05_Queues": "2a749423949534b492d4a92c02be9aa2bb269aa69b2893a65b26d3261066b6b1",
    "06_Categories": "22f491299ab4329492d2b49132919652b25ab24a964ab64a565ad65a164ab64a",
    "07_LinkGrabber": "20f4d2339a0d314c932cb70c3ab4b8b4948d958494ac9c8c54a4d4a910ac9165",
    "08_Mobile_Firmware": "26749125902b36559704a4943495b495b495b4959495b4b55495d5953495b5a8",
    "09_Operating_Systems": "2764d825d0013205954ab46a3a98b06ab25ab25a925a925a525ac25a19998a40",
    "10_Settings": "2b6494e5951233199259b59b355bb392959c9139925ab2c9531ac532115a82de",
    "11_Speed_Test_Popup": "2a6591b8909a32908b5ab1ec3364b652b552946393adb1ca516a916a34eac959",
    "12_Browser_Extension": "26649923980b3ae59118b118288cb498b365b8b1989198915890ccb81924b90e",
    "13_Check_For_Updates": "2a6490b5914932498e25b4673522b530b4729e27972fb60a516ad16a346a8139",
    "14_Help_Report_A_Bug": "266591259048381499e1b9693966b862b9689060926295635539d9b8146a8005",
    "15_About_Lumi": "2665d0e4da322bc983c9a36527c5a3618c998cf38cf38ea34b67ce930692816a",
}

DISTANCE_LIMITS = {
    "01_Overview": 65,
    "02_All_Downloads": 110,
    "03_Unfinished": 103,
    "04_Finished": 78,
    "05_Queues": 90,
    "06_Categories": 102,
    "07_LinkGrabber": 80,
    "08_Mobile_Firmware": 110,
    "09_Operating_Systems": 94,
    "10_Settings": 90,
    "11_Speed_Test_Popup": 75,
    "12_Browser_Extension": 70,
    "13_Check_For_Updates": 80,
    "14_Help_Report_A_Bug": 70,
    "15_About_Lumi": 110,
}


def git_blob(relative: str) -> str:
    return subprocess.check_output(
        ["git", "rev-parse", f"HEAD:{relative}"],
        cwd=ROOT,
        text=True,
    ).strip()


def dhash(image: Image.Image, size: int = 16) -> int:
    gray = image.convert("L").resize((size + 1, size), Image.Resampling.LANCZOS)
    pixels = list(gray.getdata())
    result = 0
    for y in range(size):
        row = y * (size + 1)
        for x in range(size):
            result = (result << 1) | int(pixels[row + x + 1] > pixels[row + x])
    return result


for relative, expected in EXPECTED_BLOBS.items():
    actual = git_blob(relative)
    if actual != expected:
        raise SystemExit(f"exact approved Git blob mismatch: {relative}: {actual} != {expected}")

runtime = json.loads((CAPTURES / "electron-runtime.json").read_text(encoding="utf-8"))
assert runtime["url"] == "http://127.0.0.1:7000/"
assert runtime["size"] == [1672, 941]
assert runtime["exactApprovedRenderer"] is True
assert runtime["captureSet"] == "owner-approved-15"

captures = sorted(CAPTURES.glob("[0-9][0-9]_*.png"))
if len(captures) != 15:
    raise SystemExit(f"expected 15 Electron captures, found {len(captures)}")

screens: dict[str, dict[str, object]] = {}
total_distance = 0
for capture in captures:
    image = Image.open(capture).convert("RGB")
    if image.size != (1672, 941):
        raise SystemExit(f"{capture.name}: wrong size {image.size}")
    if all(low == high for low, high in image.getextrema()):
        raise SystemExit(f"{capture.name}: blank capture")
    key = capture.stem
    if key not in REFERENCE_DHASH:
        raise SystemExit(f"unexpected Electron capture {key}")
    actual_hash = dhash(image)
    approved_hash = int(REFERENCE_DHASH[key], 16)
    distance = (actual_hash ^ approved_hash).bit_count()
    limit = DISTANCE_LIMITS[key]
    if distance > limit:
        raise SystemExit(f"{key}: Electron visual distance {distance} exceeds {limit}")
    total_distance += distance
    screens[key] = {
        "actual_dhash": f"{actual_hash:064x}",
        "approved_dhash": REFERENCE_DHASH[key],
        "distance": distance,
        "limit": limit,
    }

if total_distance > 1_300:
    raise SystemExit(f"aggregate Electron visual distance {total_distance} exceeds 1300")

(CAPTURES / "electron-dhash-evidence.json").write_text(
    json.dumps({
        "source_blobs": EXPECTED_BLOBS,
        "total_distance": total_distance,
        "maximum_total": 1_300,
        "screens": screens,
    }, indent=2),
    encoding="utf-8",
)
print(f"Actual Electron exact-source/visual gate: 15/15 PASS; aggregate distance={total_distance}")
