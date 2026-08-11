#!/usr/bin/env python3
"""Bind visual gates to the owner-approved fifteen-screen capture set."""
from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
FILES = [ROOT / "tests" / "visual_approved_gate.py", ROOT / "tests" / "compare_electron_visual.py"]
APPROVED = {
    "01-overview": "d53e6ba080241090203b4b74ba3de056532fc2ecb75ba2560000000000000000",
    "02-downloads": "d5be6ba08024109020384174fe618055506fc2ecb75ba2560000000000000000",
    "03-unfinished": "d53e6ba08024109020384174fe618055506fc2ecb75ba2560000000000000000",
    "04-finished": "d53e6ba08024109020384174fe618055506fc2ecb75ba2560000000000000000",
    "05-queues": "d57e6ba080241090201b7a72bf55c057517fc2ecb75ba2560000000000000000",
    "06-categories": "d56e6ba080241090201b7b72b755c057517fc2ecb75ba2560000000000000000",
    "07-linkgrabber": "d53e6ba080241090201b7a52de67c075537fc2ecb75ba2560000000000000000",
    "08-firmware": "d53e6ba08024109020085975bd7dc055536fc2ecb75ba2560000000000000000",
    "09-operating-systems": "d57e6ba08024109020085875bd7dc055536fc2ecb75ba2560000000000000000",
    "10-settings": "d15e6ba08024109025db4bb5fabb80bd425fc2ecb75ba2560000000000000000",
    "11-browser-extension": "d53e6ba08024109020354876ff3980bd426fc2ecb75ba2560000000000000000",
    "12-updates": "d53e6ba08024109020084a3a74f7c1bd527fc2ecb75ba2560000000000000000",
    "13-help": "d53e6ba080241090203a4974aa67a056532fc2ecb75ba2560000000000000000",
    "14-about": "d53e6ba080241090203b4a75aa66c056532fc2ecb75ba2560000000000000000",
    "15-gear-menu": "d53e6ba080301090605a5676de67f857536fc2ecb75ba2560000000000000000",
}

for path in FILES:
    text = path.read_text(encoding="utf-8")
    text = text.replace(
        "1cf175f6960594df2f9680b5c8f11362b48c17c5f920c08cd0fa1364c3267280",
        "20c4b67951132ca357f72d11c85e2d45383050ea61902e63980de130570cbff1",
    )
    for name, approved_hash in APPROVED.items():
        pattern = rf'("{re.escape(name)}"\s*:\s*int\(")[0-9a-f]+("\s*,\s*16\))'
        text, count = re.subn(pattern, rf'\g<1>{approved_hash}\g<2>', text)
        if count != 1:
            raise SystemExit(f"{path}: failed to bind approved hash for {name}")
        text = re.sub(rf'("{re.escape(name)}"\s*:\s*)\d+', rf'\g<1>24', text)
    text = text.replace("if total > 776:", "if total > 240:")
    text = text.replace("if total_distance > 776:", "if total_distance > 240:")
    text = text.replace("exceeds 776", "exceeds 240")
    path.write_text(text, encoding="utf-8")

contract = ROOT / "tests" / "lumi-ui-contract.test.js"
text = contract.read_text(encoding="utf-8")
text = text.replace(
    "1cf175f6960594df2f9680b5c8f11362b48c17c5f920c08cd0fa1364c3267280",
    "20c4b67951132ca357f72d11c85e2d45383050ea61902e63980de130570cbff1",
)
text = text.replace('css.includes("--accent-blue")', 'css.includes("--cyan")')
contract.write_text(text, encoding="utf-8")
print("visual gates bound to the owner-approved fifteen-screen reference set")
