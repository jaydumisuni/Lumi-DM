"""Windows source smoke test using Lumi's real engine and the public internet."""
from __future__ import annotations

import hashlib
import importlib
import os
from pathlib import Path
import sys
import time


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

PUBLIC_URL = "https://speed.cloudflare.com/__down?bytes=8388608"
EXPECTED_BYTES = 8 * 1024 * 1024


def main() -> None:
    """Download eight public megabytes through Lumi and prove final file integrity."""
    root = Path(os.environ.get("RUNNER_TEMP", ".")) / "lumi-public-internet-smoke"
    os.environ.update(
        LUMIDM_DATA_DIR=str(root / "data"),
        LUMIDM_DOWNLOAD_DIR=str(root / "downloads"),
        LUMIDM_TEMP_DIR=str(root / "temporary"),
    )
    module = importlib.import_module("server")
    client = module.app.test_client()
    client.environ_base["HTTP_ORIGIN"] = "http://localhost"
    client.environ_base["HTTP_X_LUMI_CLIENT"] = "windows-public-internet-smoke"
    bootstrap = client.get("/api/security/bootstrap")
    assert bootstrap.status_code == 200, bootstrap.get_data(as_text=True)

    started_at = time.monotonic()
    response = client.post(
        "/api/downloads/start",
        json={
            "url": PUBLIC_URL,
            "target_dir": str(root / "downloads"),
            "temp_dir": str(root / "temporary"),
            "filename": "cloudflare-public-smoke.bin",
            "connections": 32,
            "duplicate_policy": "overwrite",
        },
    )
    assert response.status_code == 200, response.get_data(as_text=True)
    task = response.get_json()
    assert task["connections"] == 32

    deadline = time.monotonic() + 120
    result = task
    while time.monotonic() < deadline:
        status = client.get(f"/api/downloads/{task['id']}")
        assert status.status_code == 200, status.get_data(as_text=True)
        result = status.get_json()
        if result.get("status") in {"completed", "failed", "cancelled", "needs_link"}:
            break
        time.sleep(0.2)

    assert result.get("status") == "completed", result
    final_path = Path(result["final_path"])
    assert final_path.exists()
    assert final_path.stat().st_size == EXPECTED_BYTES
    digest = hashlib.sha256(final_path.read_bytes()).hexdigest()
    assert len(digest) == 64
    assert len(set(final_path.read_bytes()[:4096])) > 1, "public payload must contain real data"
    elapsed = time.monotonic() - started_at
    throughput_mbps = EXPECTED_BYTES * 8 / elapsed / 1_000_000
    print(
        {
            "source": PUBLIC_URL,
            "bytes": EXPECTED_BYTES,
            "sha256": digest,
            "seconds": round(elapsed, 3),
            "observed_mbps": round(throughput_mbps, 2),
            "mode": result.get("mode"),
            "connections": result.get("connections"),
        }
    )


if __name__ == "__main__":
    main()
