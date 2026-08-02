#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CAPTURES = ROOT / "artifacts" / "electron-visual"
EXPECTED_FILES = {
    "static/index.html": "7a99817a0c0a898fd111c36c554df40e0b138e17d5f366603e2870ceb5835a7e",
    "static/lumi-approved-ui.css": "fb5a17c0c573643bc6644859d98bb9ffacbd020573a8589b2807b3def7f9c8b3",
    "static/lumi-approved-ui.js": "1cf175f6960594df2f9680b5c8f11362b48c17c5f920c08cd0fa1364c3267280",
    "static/assets/lumi-brand-transparent.png": "b49a92046af4d2368c1481f63a40fddae4a5371c005e7eb62976835ee269d944",
}
REFERENCE_HASHES = {
    "01-overview": int("d73e6baf80241090203b4b74ba3de056532fc2ecb75ba2570000000000000000", 16),
    "02-downloads": int("ddbe6baf8024109020384174fe618055506fc2ecb75ba2420000000000000000", 16),
    "03-unfinished": int("dd3e6baf8024109020384174fe618055506fc2ecb75ba2420000000000000000", 16),
    "04-finished": int("dd3e6baf8024109020384174fe618055506fc2ecb75ba2420000000000000000", 16),
    "05-queues": int("d77e6baf80241090201b7a72bf55c057517fc2ecb75ba2530000000000000000", 16),
    "06-categories": int("d76e6baf80241090201b7b72b755c057517fc2ecb75ba2520000000000000000", 16),
    "07-linkgrabber": int("dd3e6baf80241090201b7a52de67c075537fc2ecb75ba2430000000000000000", 16),
    "08-firmware": int("d53e6baf8024109020085975bd7dc055536fc2ecb75ba2520000000000000000", 16),
    "09-operating-systems": int("d57e6baf8024109020085875bd7dc055536fc2ecb75ba2520000000000000000", 16),
    "10-settings": int("d15e6baf8024109025db4bb5fabb80bd425fc2ecb75ba2520000000000000000", 16),
    "11-browser-extension": int("dd3e6baf8024109020354876ff3980bd426fc2ecb75ba2420000000000000000", 16),
    "12-updates": int("dd3e6baf8024109020084a3a74f7c1bd527fc2ecb75ba2420000000000000000", 16),
    "13-help": int("dd3e6baf80241090203a4974aa67a056532fc2ecb75ba2420000000000000000", 16),
    "14-about": int("dd3e6baf80241090203b4a75aa66c056532fc2ecb75ba2420000000000000000", 16),
    "15-gear-menu": int("d53e6ba080300890605a5676de67f857536fc2ecb75ba2520000000000000000", 16),
}
DISTANCE_LIMITS = {
    "01-overview": 48, "02-downloads": 44, "03-unfinished": 45, "04-finished": 45,
    "05-queues": 49, "06-categories": 50, "07-linkgrabber": 49, "08-firmware": 42,
    "09-operating-systems": 41, "10-settings": 69, "11-browser-extension": 57,
    "12-updates": 50, "13-help": 51, "14-about": 54, "15-gear-menu": 73,
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def dhash(image: Image.Image, size: int = 16) -> int:
    gray = image.convert("L").resize((size + 1, size), Image.Resampling.LANCZOS)
    pixels = list(gray.getdata())
    result = 0
    for y in range(size):
        row = y * (size + 1)
        for x in range(size):
            result = (result << 1) | int(pixels[row + x] > pixels[row + x + 1])
    return result


for relative, expected in EXPECTED_FILES.items():
    actual = sha(ROOT / relative)
    if actual != expected:
        raise SystemExit(f"exact approved source mismatch: {relative}: {actual} != {expected}")

runtime = json.loads((CAPTURES / "electron-runtime.json").read_text(encoding="utf-8"))
assert runtime["url"] == "http://127.0.0.1:7000/"
assert runtime["size"] == [1672, 941]
assert runtime["exactApprovedRenderer"] is True

captures = sorted(CAPTURES.glob("[0-9][0-9]-*.png"))
if len(captures) != 15:
    raise SystemExit(f"expected 15 Electron captures, found {len(captures)}")

evidence = {}
total_distance = 0
for capture in captures:
    image = Image.open(capture).convert("RGB")
    if image.size != (1672, 941):
        raise SystemExit(f"{capture.name}: wrong size {image.size}")
    extrema = image.getextrema()
    if all(low == high for low, high in extrema):
        raise SystemExit(f"{capture.name}: blank capture")
    stem = capture.stem
    actual_hash = dhash(image)
    distance = (actual_hash ^ REFERENCE_HASHES[stem]).bit_count()
    limit = DISTANCE_LIMITS[stem]
    if distance > limit:
        raise SystemExit(f"{stem}: Electron visual distance {distance} exceeds {limit}")
    total_distance += distance
    evidence[stem] = {
        "actual_dhash": f"{actual_hash:064x}",
        "approved_dhash": f"{REFERENCE_HASHES[stem]:064x}",
        "distance": distance,
        "limit": limit,
    }
if total_distance > 776:
    raise SystemExit(f"aggregate Electron visual distance {total_distance} exceeds 776")

(CAPTURES / "electron-dhash-evidence.json").write_text(
    json.dumps({"total_distance": total_distance, "screens": evidence}, indent=2),
    encoding="utf-8",
)
print(f"Actual Electron visual/source gate: 15/15 PASS; aggregate distance={total_distance}")
