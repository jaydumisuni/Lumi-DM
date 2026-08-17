from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def test_stage0_renderer_trace_loads_before_primary_correction_modules() -> None:
    loader = read("static/main-ui.js")
    assert '"/static/stage0-trace.js"' in loader
    assert loader.index('"/static/stage0-trace.js"') < loader.index('"/static/main-ui-core.js"')
    assert loader.index('"/static/stage0-trace.js"') < loader.index('"/static/interaction-contract.js"')


def test_renderer_trace_correlates_physical_actions_and_same_origin_api() -> None:
    trace = read("static/stage0-trace.js")
    assert 'event.isTrusted' in trace
    assert '"CLICK_RECEIVED"' in trace
    assert '"ACTION_CREATED"' in trace
    assert '"TRANSPORT_SENT"' in trace
    assert '"RESPONSE_RECEIVED"' in trace
    assert 'headers.set("X-Lumi-Trace-Id", traceId)' in trace
    assert 'parsed.pathname.startsWith("/api/")' in trace
    assert 'parsed.origin === location.origin' in trace
    # Correlation may forward the original fetch unchanged, but diagnostic
    # records must never copy request payloads into emitted trace metadata.
    assert "body: init.body" not in trace
    assert "body: input.body" not in trace
    assert "request bodies" in trace.lower()


def test_sandboxed_preload_forwards_trace_and_main_process_persists_it() -> None:
    preload = read("electron/preload-main.js")
    main_trace = read("electron/stage0-trace.js")

    assert 'const { contextBridge, ipcRenderer } = require("electron")' in preload
    for forbidden in ('require("fs")', 'require("path")', 'require("os")', 'require("crypto")'):
        assert forbidden not in preload
    assert 'ipcRenderer.send("ttg-stage0-trace", payload)' in preload
    assert "invokeWithTrace(channel" in preload
    assert "TRANSPORT_SENT" in preload
    assert "RESPONSE_RECEIVED" in preload
    assert "TRANSPORT_ERROR" in preload
    assert "ttg-open-path" in preload
    assert "ttg-open-external" in preload
    assert "body:" not in preload

    assert 'const { app, ipcMain } = require("electron")' in main_trace
    assert 'ipcMain.on("ttg-stage0-trace"' in main_trace
    assert "LUMIDM-stage0-electron-trace.jsonl" in main_trace
    assert "writeStage0Trace(value.event" in main_trace
    assert "ALLOWED_DETAIL_KEYS" in main_trace


def test_runtime_trace_is_installed_before_security_and_excludes_sensitive_content() -> None:
    launcher = read("server.py")
    trace = read("core/v2/stage0_trace.py")
    assert "install_stage0_trace(app)" in launcher
    assert launcher.index("install_stage0_trace(app)") < launcher.index("install_v4(app)")
    assert 'request.headers.get("X-Lumi-Trace-Id"' in trace
    assert '"RUNTIME_RECEIVED"' in trace
    assert '"RUNTIME_RESPONSE"' in trace
    assert '"ENGINE_RESULT"' in trace
    assert 'request.path == "/api/downloads/start"' in trace
    assert 'requested_connections=' in trace
    assert 'effective_connections=' in trace
    assert "request bodies" in trace.lower()
    assert "query strings" in trace.lower()


def test_sidecar_supervisor_emits_lifecycle_evidence() -> None:
    supervisor = read("electron/server-supervisor.js")
    for event in (
        "SIDECAR_SUPERVISOR_START",
        "SIDECAR_SPAWN_REQUEST",
        "SIDECAR_SPAWNED",
        "SIDECAR_EXIT",
        "SIDECAR_NOT_READY",
        "SIDECAR_RECOVERED",
        "SIDECAR_STOP_REQUEST",
    ):
        assert event in supervisor


def test_stage0_policy_pointer_is_carried_on_the_correction_branch() -> None:
    policy = read(".ttg/project-policy.yaml")
    assert "ttg.tenfold.v1" in policy
    assert "05_STANDARDS/Tenfold_Execution_Standard.md" in policy
