from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_ID = "ifgiifbpjflfhibmhaojogjcecpfdljp"


def extension_id(manifest: dict) -> str:
    key = base64.b64decode(manifest["key"])
    digest = hashlib.sha256(key).digest()[:16]
    alphabet = "abcdefghijklmnop"
    return "".join(alphabet[n] for byte in digest for n in (byte >> 4, byte & 0x0F))


def test_every_bundled_chromium_extension_path_uses_same_auto_trust_identity():
    roots = [ROOT / "browser-extension", ROOT / "static" / "browser-extension" / "chromium"]
    for root in roots:
        manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
        popup = (root / "popup.html").read_text(encoding="utf-8")
        background = (root / "background.js").read_text(encoding="utf-8")
        assert extension_id(manifest) == EXPECTED_ID, root
        assert manifest["version"] == "5.1.0", root
        assert 'mode: "local_extension"' in background, root
        assert 'id="pair-code"' not in popup, root
        assert '>Pair<' not in popup, root
        assert "Automatic local trust" in popup, root


def test_obsolete_manual_pairing_scripts_are_not_bundled():
    legacy = ROOT / "browser-extension"
    for name in ("popup-security.js", "security-shim.js", "popup-native-handoff.js"):
        assert not (legacy / name).exists(), name
