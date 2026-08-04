"""Windows source smoke test using Lumi's real engine and the public internet."""
from __future__ import annotations

import hashlib
import importlib
import os
from pathlib import Path
import sys
import time
from urllib.request import Request, urlopen

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

PUBLIC_URL = "https://speed.cloudflare.com/__down?bytes=8388608"
EXPECTED_BYTES = 8 * 1024 * 1024
ATTEMPTS = 3


def reference_payload() -> bytes:
    """Fetch the same public object directly with bounded retry/backoff."""
    last_error: Exception | None = None
    for attempt in range(1, ATTEMPTS + 1):
        try:
            request = Request(PUBLIC_URL, headers={"User-Agent": "Lumi-release-gate-reference"})
            with urlopen(request, timeout=45) as response:
                payload = response.read()
            if len(payload) != EXPECTED_BYTES:
                raise RuntimeError(f"reference size was {len(payload)}, expected {EXPECTED_BYTES}")
            return payload
        except Exception as error:  # pragma: no cover - depends on public network
            last_error = error
            if attempt < ATTEMPTS:
                time.sleep(2 ** (attempt - 1))
    raise RuntimeError(f"reference public download failed after {ATTEMPTS} attempts: {last_error}")


def wait_for_task(client, task_id: str, timeout: float = 120) -> dict:
    """Wait for a Lumi task to reach a terminal state."""
    deadline = time.monotonic() + timeout
    result: dict = {}
    while time.monotonic() < deadline:
        status = client.get(f"/api/downloads/{task_id}")
        if status.status_code != 200:
            raise RuntimeError(status.get_data(as_text=True))
        result = status.get_json()
        if result.get("status") in {"completed", "failed", "cancelled", "needs_link"}:
            return result
        time.sleep(0.2)
    raise TimeoutError(f"Lumi public task timed out: {result}")


def main() -> None:
    """Download eight public megabytes through Lumi and compare exact bytes."""
    reference = reference_payload()
    reference_digest = hashlib.sha256(reference).hexdigest()
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

    last_error: Exception | None = None
    for attempt in range(1, ATTEMPTS + 1):
        try:
            started_at = time.monotonic()
            response = client.post(
                "/api/downloads/start",
                json={
                    "url": PUBLIC_URL,
                    "target_dir": str(root / "downloads"),
                    "temp_dir": str(root / "temporary"),
                    "filename": f"cloudflare-public-smoke-{attempt}.bin",
                    "connections": 32,
                    "duplicate_policy": "overwrite",
                },
            )
            assert response.status_code == 200, response.get_data(as_text=True)
            task = response.get_json()
            assert task["connections"] == 32
            result = wait_for_task(client, task["id"])
            if result.get("status") != "completed":
                raise RuntimeError(f"Lumi public task failed: {result}")
            final_path = Path(result["final_path"])
            payload = final_path.read_bytes()
            if len(payload) != EXPECTED_BYTES:
                raise RuntimeError(f"Lumi size was {len(payload)}, expected {EXPECTED_BYTES}")
            digest = hashlib.sha256(payload).hexdigest()
            if digest != reference_digest or payload != reference:
                raise RuntimeError({"reference_sha256": reference_digest, "lumi_sha256": digest})
            elapsed = time.monotonic() - started_at
            throughput_mbps = EXPECTED_BYTES * 8 / elapsed / 1_000_000
            print({
                "source": PUBLIC_URL,
                "bytes": EXPECTED_BYTES,
                "sha256": digest,
                "seconds": round(elapsed, 3),
                "observed_mbps": round(throughput_mbps, 2),
                "mode": result.get("mode"),
                "connections": result.get("connections"),
                "attempt": attempt,
            })
            return
        except Exception as error:  # pragma: no cover - depends on public network
            last_error = error
            if attempt < ATTEMPTS:
                time.sleep(2 ** (attempt - 1))
    raise RuntimeError(f"Lumi public smoke failed after {ATTEMPTS} attempts: {last_error}")


if __name__ == "__main__":
    main()
