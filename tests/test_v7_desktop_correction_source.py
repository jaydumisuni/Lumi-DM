from __future__ import annotations

import base64
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def text(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def test_one_runtime_and_owned_sidecar_contract_are_explicit() -> None:
    supervisor = text("electron/server-supervisor.js")
    runtime = text("core/v7/runtime_contract.py")
    desktop_auth = text("core/v7/desktop_auth.py")
    surfaces = text("electron/roadmap-surfaces.js")

    assert 'RUNTIME_SCHEMA = "lumi.runtime.v1"' in supervisor
    assert 'response.statusCode === 200' in supervisor
    assert 'schema === RUNTIME_SCHEMA' in supervisor
    assert 'instance === expectedInstance' in supervisor
    assert 'pid === expectedPid' in supervisor
    assert 'X-Lumi-Desktop-Secret' in supervisor
    assert 'LUMIDM_DESKTOP_SECRET' in desktop_auth
    assert 'hmac.compare_digest' in desktop_auth
    assert 'owned_desktop' in desktop_auth
    assert 'SCHEMA = "lumi.runtime.v1"' in runtime
    assert 'app.register_blueprint(wave7_api)' in runtime
    assert "new BrowserWindow" not in surfaces
    assert "browser.confirm" in surfaces
    assert "resizeAnchored(widgetWindow(), false)" in surfaces


def test_http_connection_policy_is_32_at_runtime_and_engine_boundary() -> None:
    runtime = text("core/v7/runtime_contract.py")
    boundary = text("core/v7/connection_contract.py")
    settings = text("static/roadmap-corrections.js")
    remote = text("core/v7/remote_contract.py")

    assert "CANONICAL_HTTP_CONNECTIONS = 32" in runtime
    assert 'runtime.store.set_setting("default_connections", CANONICAL_HTTP_CONNECTIONS)' in runtime
    assert "runtime.queue.starter = starter" in boundary
    assert "task.connections = CANONICAL_HTTP_CONNECTIONS" in boundary
    assert "connection_policy_engine_boundary" in boundary
    assert '>32 connections<' in settings
    assert 'data["connections"] = 32' in remote


def test_main_window_is_compact_and_geometry_has_one_native_owner() -> None:
    main = text("electron/main.js")
    contract = text("electron/window-contract.js")

    assert "width: 920" in main
    assert "height: 650" in main
    assert "minWidth: 720" in main
    assert "minHeight: 500" in main
    assert "setMinimumSize(1024" not in contract
    assert "1180" not in contract
    assert "window.setSize(" not in contract
    assert 'LUMIDM-desktop.json' in contract
    assert 'LUMIDM-desktop-widget.json' not in contract


def test_interaction_correction_is_audit_only_and_titlebar_is_hit_testable() -> None:
    loader = text("static/main-ui.js")
    correction = text("static/roadmap-corrections.js")
    shell = text("static/ttg-shell.js")

    assert loader.index('"/static/interaction-contract.js"') < loader.index('"/static/roadmap-corrections.js"')
    assert loader.index('"/static/roadmap-corrections.js"') < loader.index("UI.installInteractionContract()")
    assert "UI.installInteractionContract = function installInteractionAudit" in correction
    assert "stopImmediatePropagation" not in correction
    assert "-webkit-app-region:no-drag!important" in correction
    assert "pointer-events:auto!important" in correction
    assert "[data-window-action]" in shell
    assert "window.electronApp.windowControl" in shell


def test_same_pc_extension_is_fixed_identity_auto_trust_and_valid_mv3() -> None:
    manifest = json.loads(text("static/browser-extension/chromium/manifest.json"))
    background = text("static/browser-extension/chromium/background.js")
    popup = text("static/browser-extension/chromium/popup.html")
    popup_js = text("static/browser-extension/chromium/popup.js")
    server = text("core/v7/runtime_contract.py")

    key_bytes = base64.b64decode(manifest["key"])
    digest = hashlib.sha256(key_bytes).digest()[:16]
    alphabet = "abcdefghijklmnop"
    extension_id = "".join(alphabet[nibble] for byte in digest for nibble in (byte >> 4, byte & 0x0F))
    assert extension_id == "ifgiifbpjflfhibmhaojogjcecpfdljp"
    assert extension_id in server

    assert manifest["manifest_version"] == 3
    assert manifest["content_scripts"][0]["js"] == ["content-v2.js"]
    assert all(not pattern.startswith(("ws://", "wss://")) for pattern in manifest["host_permissions"])
    assert "http://127.0.0.1/*" in manifest["host_permissions"]
    assert "http://localhost/*" in manifest["host_permissions"]

    assert 'mode: "local_extension"' in background
    assert 'BRIDGE_URL = "ws://127.0.0.1:7001"' in background
    assert "browser.hello" in background
    assert "browser.ping" in background
    assert "scheduleReconnect" in background
    assert "outbound.length >= 50" in background
    assert "connections: 32" in background
    assert 'id="pair-code"' not in popup
    assert "Forget pairing" not in popup
    assert "Pair with Lumi" not in popup_js
    assert "Automatic local trust" in popup


def test_browser_media_is_browser_first_untruncated_and_terminal() -> None:
    content = text("static/browser-extension/chromium/content-v2.js")
    background = text("static/browser-extension/chromium/background.js")
    media = text("core/v7/media_resolver.py")

    assert 'performance.getEntriesByType("resource")' in content
    assert 'document.querySelectorAll("video,audio")' in content
    assert 'element.querySelectorAll("track")' in content
    assert "slice(0,9)" not in content.replace(" ", "")
    assert 'max-height:410px;overflow:auto' in content
    assert 'type: "lumi-media-discover"' in content
    assert "inspectManifest" in background
    assert 'kind: "hls"' in background
    assert 'kind: "dash"' in background

    for state in (
        "variants_found",
        "no_downloadable_media",
        "session_unavailable",
        "resolver_timeout",
        "unsupported_protected",
        "error",
    ):
        assert state in media
    assert "formats[:9]" not in media
    assert "_deduplicate" in media


def test_browser_capture_uses_existing_widget_and_inactive_runtime_queue() -> None:
    surface = text("core/v7/surface_contract.py")
    native = text("electron/roadmap-surfaces.js")
    main = text("electron/main.js")

    assert 'PENDING_QUEUE_ID = "browser-pending"' in surface
    assert "active=False" in surface
    assert "browser.capture.widget_pending" in surface
    assert 'task.status = TaskStatus.QUEUED.value' in surface
    assert "executeJavaScript" in native
    assert 'data-tab="queued"' in native
    assert "forcedPendingExpansion" in native
    assert "surfaceExpanded = false" in native
    # Legacy setup code may remain for old clients, but the canonical v7 path
    # must never emit the legacy status that main.js scans for.
    assert 'task.status = TaskStatus.QUEUED.value' in surface
    assert 'task.status = _BROWSER_PENDING' not in surface
    assert 'task.status === "browser_pending"' in main


def test_firmware_dependency_order_and_real_bundled_extension_action() -> None:
    correction = text("static/roadmap-corrections.js")
    shell = text("static/main-ui-shell.js")
    preload = text("electron/preload-main.js")
    contract = text("electron/window-contract.js")

    brand = correction.index("Brand<select")
    model = correction.index("Model<input")
    source = correction.index("Source<select")
    channel = correction.index("Channel<select")
    assert brand < model < source < channel
    assert "lumi-firmware-model-list" in correction
    assert "Search model, model number or codename" in correction
    assert "Select model first" in correction

    assert "prepareBrowserExtension" in shell
    assert "not bundled in this build yet" not in shell
    assert "ttg-prepare-browser-extension" in preload
    assert "ttg-prepare-browser-extension" in contract
    assert 'static", "browser-extension", "chromium"' in contract


def test_remote_clients_reuse_runtime_rpc_instead_of_embedding_another_manager() -> None:
    remote = text("core/v7/remote_contract.py")
    runtime = text("core/v7/runtime_contract.py")

    assert 'name == "download.request"' in remote
    assert 'return original(app, "download.create", data)' in remote
    assert '"runtime.capabilities"' in remote
    assert '"download.request"' in remote
    assert '"download.pause"' in remote
    assert '"download.resume"' in remote
    assert '"download.cancel"' in remote
    assert '"queue.start"' in remote
    assert '"queue.stop"' in remote
    assert '"/rpc"' in runtime
