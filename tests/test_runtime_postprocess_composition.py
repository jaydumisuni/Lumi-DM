from pathlib import Path
import os
import subprocess
import sys


def test_reliability_preserves_composed_http_postprocessors(tmp_path):
    root = Path(__file__).resolve().parents[1]
    env = dict(os.environ)
    env["LUMIDM_DATA_DIR"] = str(tmp_path / "data")
    code = "import server; from core.v2 import runtime; print('|'.join(c.__name__ for c in runtime.HTTPTransferRunner.__mro__))"
    result = subprocess.run([sys.executable, "-c", code], cwd=root, env=env, capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stderr
    names = result.stdout.strip().split("|")
    assert "VerifiedArtifactHTTPTransferRunner" in names
    assert "SamsungFirmwareHTTPTransferRunner" in names
    assert "Wave3HTTPTransferRunner" in names
    assert names.index("VerifiedArtifactHTTPTransferRunner") < names.index("SamsungFirmwareHTTPTransferRunner") < names.index("Wave3HTTPTransferRunner")
