from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "static"


def read(name: str) -> str:
    return (STATIC / name).read_text(encoding="utf-8")


def test_interaction_contract_is_loaded_after_primary_modules():
    loader = read("main-ui.js")
    assert '"/static/interaction-contract.js"' in loader
    assert "UI.installInteractionContract();" in loader
    assert loader.index('"/static/main-ui-fixes.js"') < loader.index('"/static/interaction-contract.js"')
    assert loader.index("UI.bindPrimaryActions();") < loader.index("UI.installInteractionContract();")


def test_all_sidebar_routes_have_real_view_targets():
    html = read("index.html")
    expected = {
        "overview", "downloads", "unfinished", "finished", "queues",
        "categories", "grabber", "firmware", "operating_systems",
    }
    for view in expected:
        assert f'data-view="{view}"' in html
        assert f'id="view-{view}"' in html


def test_static_navigation_and_technician_group_are_authoritatively_routed():
    contract = read("interaction-contract.js")
    assert 'event.target.closest(".nav-group-toggle")' in contract
    assert 'event.target.closest(".nav-item[data-view]")' in contract
    assert "event.stopImmediatePropagation();" in contract
    assert "setTechnicianOpen(!group?.classList.contains(\"open\"));" in contract
    assert 'new Set(["firmware", "operating_systems"])' in contract
    assert "function openTechnicianView(view, nav)" in contract
    assert 'view === "firmware" && typeof openFirmwareView === "function"' in contract
    assert 'view === "operating_systems" && typeof UI.openOperatingSystems === "function"' in contract


def test_technician_navigation_has_one_active_capture_owner():
    loader = read("main-ui.js")
    fixes = read("main-ui-fixes.js")
    hardening = read("app-hardening.js")
    contract = read("interaction-contract.js")

    assert "installFirmwareNavigation" not in loader
    assert '.nav-item[data-view="operating_systems"]' not in fixes
    assert '.nav-item[data-view="operating_systems"]' not in hardening
    assert 'document.addEventListener("click", handleStaticShellClick, true);' in contract
    assert "event.stopImmediatePropagation();" in contract


def test_operating_system_reopen_refreshes_saved_family():
    opener = read("operating-systems-open.js")
    assert opener.count('sessionStorage.getItem("LUMI.osFamily") || "Windows"') >= 2
    assert 'family = sessionStorage.getItem("LUMI.osFamily") || "Windows";' in opener


def test_download_views_reset_stale_filters_when_route_changes():
    contract = read("interaction-contract.js")
    assert 'new Set(["downloads", "unfinished", "finished"])' in contract
    assert 'state.statusFilter = "all";' in contract


def test_new_download_and_mobile_sidebar_have_fallback_routing():
    contract = read("interaction-contract.js")
    assert 'event.target.closest("#new-download-btn")' in contract
    assert 'typeof openNewModal === "function"' in contract
    assert 'event.target.closest("#sidebar-open")' in contract
    assert 'event.target.closest("#sidebar-close")' in contract


def test_dynamic_primary_controls_use_delegated_contracts():
    shell = read("main-ui-shell.js")
    required = [
        "[data-main-open-new]", "[data-main-view]", "[data-main-task-action]",
        "[data-main-queue-one]", "[data-main-settings-tab]", "[data-main-browse]",
        "[data-main-health-check]", "[data-main-shell-action]",
    ]
    for selector in required:
        assert selector in shell
    assert 'document.addEventListener("click"' in shell


def test_core_renderer_forms_modals_tabs_and_inspector_have_handlers():
    app = read("app.js")
    required = [
        'document.getElementById("content")?.addEventListener("click", handleContentClick)',
        'document.getElementById("content")?.addEventListener("submit", handleContentSubmit)',
        'document.getElementById("source-tabs")?.addEventListener("click"',
        'document.getElementById("source-body")?.addEventListener("click", handleSourceClick)',
        'document.getElementById("source-body")?.addEventListener("submit", handleSourceSubmit)',
        'document.getElementById("queue-form")?.addEventListener("submit", createQueue)',
        'document.getElementById("category-form")?.addEventListener("submit", createCategory)',
        'document.getElementById("inspector-tabs")?.addEventListener("click"',
        'document.getElementById("inspector-body")?.addEventListener("click", event => {',
        'void handleTaskAction(button.dataset.action, state.inspector.task.id);',
    ]
    for binding in required:
        assert binding in app


def test_direct_download_ui_reaches_engine_and_verifies_persistence():
    download = read("main-ui-download.js")
    assert 'api("POST", "/api/downloads/start"' in download
    assert "created.push(await verifyCreatedTask(task));" in download
    assert 'api("GET", "/api/downloads?limit=5000")' in download
    assert "window.startDirect = startDirectPrimary;" in download
    assert "try { startDirect = startDirectPrimary; }" in download


def test_http_engine_has_exact_file_and_resume_proofs():
    proof = (ROOT / "tests" / "test_v2_http.py").read_text(encoding="utf-8")
    assert "test_parallel_http_download_produces_exact_file" in proof
    assert "assert Path(completed.final_path).read_bytes() == PAYLOAD" in proof
    assert "test_pause_restart_and_resume_uses_segment_journal" in proof
    assert "assert journal is not None" in proof


def test_media_torrent_firmware_and_os_surfaces_have_real_handlers():
    app = read("app.js")
    firmware = read("technician-workspaces.js")
    operating_systems = read("operating-systems.js")
    assert 'if (kind === "media-inspect") return inspectMedia(form);' in app
    assert 'if (kind === "video-start") return startMedia(form);' in app
    assert 'if (kind === "torrent-inspect") return inspectTorrent(form);' in app
    assert 'if (kind === "torrent-start") return startTorrent(form);' in app
    assert 'data-firmware-action="download"' in firmware
    assert 'data-firmware-action="source"' in firmware
    assert 'view.addEventListener("click", handleClick);' in operating_systems
    assert 'data-os-action="download"' in operating_systems
    assert 'data-os-action="resolve"' in operating_systems


def test_technician_submenu_visibility_contract_exists_in_css():
    css = read("main-ui.css")
    assert ".nav-submenu{display:none" in css
    assert ".nav-group.open .nav-submenu{display:grid" in css


def test_known_false_affordances_are_repaired_in_runtime_contract():
    contract = read("interaction-contract.js")
    assert 'label.startsWith("this session")' in contract
    assert 'button.dataset.contractReady = "queue-menu"' in contract
    assert 'className = "lumi-card-contract-menu"' in contract
    assert 'visual.setAttribute("aria-hidden", "true")' in contract


def test_runtime_audit_rejects_visible_unbound_buttons_and_missing_views():
    contract = read("interaction-contract.js")
    assert "function auditInteractionContract()" in contract
    assert 'type: "unbound-button"' in contract
    assert 'type: "missing-view-element"' in contract
    assert 'window.LumiInteractionAudit = result;' in contract
    assert 'dataset.lumiInteractionContract = result.ok ? "ready" : "failed"' in contract
