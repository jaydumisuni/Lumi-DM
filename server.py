"""Lumi Download Manager source launcher."""
from __future__ import annotations

import os
import sys


# PyInstaller's Windows GUI/no-console bootloader intentionally leaves these
# streams unavailable. Lumi's internal Flask service still emits normal startup
# and Werkzeug logging, so provide a harmless sink instead of allowing a print
# or logging write to abort the sidecar before Electron can connect to it.
if getattr(sys, "frozen", False):
    if sys.stdout is None:
        sys.stdout = open(os.devnull, "w", encoding="utf-8")
    if sys.stderr is None:
        sys.stderr = open(os.devnull, "w", encoding="utf-8")

from core.v2 import server_app as _server_app
from core.v2.server_app import app, main
from core.v3.api import wave3_api
from core.v3 import hardening as _wave3_hardening  # noqa: F401
from core.v4 import install_v4
from core.v5 import install_v5
from core.v5.browser_api import wave5_browser_api
from core.v5.desktop_api import wave5_desktop_api
from core.v5.os_api import install_os_api, wave5_os_api
from core.v6 import install_reliability
from core.engine_v2 import get_default_connections, set_default_connections


# Lumi's established high-performance default is 32 connections per HTTP task.
# Preserve an explicit saved user value, but migrate fresh profiles away from the
# Wave-2 implementation's internal fallback of 8.
if "default_connections" not in _server_app._settings:
    _default_connections = set_default_connections(32)
    _server_app._settings["default_connections"] = _default_connections
    _server_app._write_settings(_server_app._settings)
elif get_default_connections() != int(_server_app._settings["default_connections"]):
    set_default_connections(int(_server_app._settings["default_connections"]))

# Browser capture is capped at 4 MiB. Keep enough JSON/base64 overhead for a
# legitimate envelope while rejecting unbounded local API payloads.
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024
if "lumi_wave3" not in app.blueprints:
    app.register_blueprint(wave3_api)
install_v4(app)
install_v5(app)
install_os_api()
install_reliability()
if "lumi_wave5_browser" not in app.blueprints:
    app.register_blueprint(wave5_browser_api)
if "lumi_wave5_desktop" not in app.blueprints:
    app.register_blueprint(wave5_desktop_api)
if "lumi_wave5_os" not in app.blueprints:
    app.register_blueprint(wave5_os_api)

__all__ = ["app", "main"]


if __name__ == "__main__":
    main()
