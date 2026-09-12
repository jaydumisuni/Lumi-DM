from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys

from core.v2.models import RequestEnvelope
from core.v2.vault import secure_request_envelope


def test_public_request_view_survives_missing_vault_entry(tmp_path: Path) -> None:
    secured = secure_request_envelope(
        tmp_path,
        {
            "url": "https://example.invalid/private.bin",
            "headers": {
                "Authorization": "Bearer private-token",
                "Referer": "https://example.invalid/account",
            },
        },
    )
    envelope = RequestEnvelope.from_dict(secured)

    # Replay must fail later if encrypted state is damaged, but listing and
    # diagnostics must remain available and secret-safe.
    entries = tmp_path / "vault" / "entries.json"
    entries.write_text("{}", encoding="utf-8")

    public = envelope.redacted_dict()

    assert public["headers"]["Referer"] == "https://example.invalid/account"
    assert public["headers"]["Sensitive-Headers"] == "<redacted-unavailable>"
    assert public["secret_headers_reference"] == "<secure-reference>"
    assert "private-token" not in str(public)


def test_browser_extension_avoids_page_secret_and_post_body_capture() -> None:
    root = Path(__file__).resolve().parents[1]
    manifest = __import__("json").loads((root / "browser-extension" / "manifest.json").read_text(encoding="utf-8"))
    background = (root / "browser-extension" / "background.js").read_text(encoding="utf-8")
    content = (root / "browser-extension" / "content-v2.js").read_text(encoding="utf-8")

    assert "cookies" not in manifest["permissions"]
    assert "webRequest" not in manifest["permissions"]
    assert "requestBody" not in background
    assert "document.cookie" not in content
    assert 'mode: "local_extension"' in background
    assert "browser.capture" in background


def test_local_server_rejects_unbounded_request_envelopes(tmp_path: Path) -> None:
    root = Path(__file__).resolve().parents[1]
    environment = dict(os.environ)
    environment["LUMIDM_DATA_DIR"] = str(tmp_path / "server-data")
    proof = (
        "import server; "
        "assert server.app.config['MAX_CONTENT_LENGTH'] == 8 * 1024 * 1024; "
        "client=server.app.test_client(); "
        "response=client.post('/api/security/pair', "
        "data=b'x'*(8*1024*1024+1), content_type='application/json'); "
        "assert response.status_code == 413, response.status_code"
    )
    result = subprocess.run(
        [sys.executable, "-c", proof],
        cwd=root,
        env=environment,
        capture_output=True,
        text=True,
        timeout=30,
    )

    assert result.returncode == 0, result.stderr
