"""Restart-level proof for Lumi's persisted connection setting."""
from __future__ import annotations

import importlib
import os
from pathlib import Path
import sys


REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def _new_application(data_dir: Path):
    """Import a fresh Lumi application instance using the same persistent store."""
    runtime = sys.modules.get("core.v2.runtime")
    current = getattr(runtime, "_RUNTIME", None) if runtime else None
    if current is not None:
        current.close()
        runtime._RUNTIME = None

    for name in list(sys.modules):
        if name == "server" or name.startswith("core."):
            sys.modules.pop(name, None)

    os.environ["LUMIDM_DATA_DIR"] = str(data_dir)
    module = importlib.import_module("server")
    client = module.app.test_client()
    client.environ_base["HTTP_ORIGIN"] = "http://localhost"
    client.environ_base["HTTP_X_LUMI_CLIENT"] = "settings-restart-test"
    response = client.get("/api/security/bootstrap")
    assert response.status_code == 200, response.get_data(as_text=True)
    return client


def test_default_connections_survive_restart(tmp_path):
    """Save 12, restart the application, then observe 12 from the reopened store."""
    data_dir = tmp_path / "data"
    first = _new_application(data_dir)
    assert first.get("/api/settings").get_json()["default_connections"] == 32
    saved = first.post("/api/settings/connections", json={"value": 12})
    assert saved.status_code == 200, saved.get_data(as_text=True)

    reopened = _new_application(data_dir)
    assert reopened.get("/api/settings").get_json()["default_connections"] == 12
    restored = reopened.post("/api/settings/connections", json={"value": 32})
    assert restored.status_code == 200, restored.get_data(as_text=True)
