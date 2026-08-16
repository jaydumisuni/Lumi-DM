from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "static"
WORKFLOWS = ROOT / ".github" / "workflows"


def test_proof_workflows_do_not_persist_checkout_credentials():
    names = (
        "current-functional-proof.yml",
        "desktop-browser-e2e-current.yml",
        "desktop-browser-e2e.yml",
        "full-desktop-interaction-contract.yml",
    )
    for name in names:
        text = (WORKFLOWS / name).read_text(encoding="utf-8")
        assert "uses: actions/checkout@v4" in text
        assert "persist-credentials: false" in text


def test_deferred_interaction_initialization_reports_failures():
    text = (STATIC / "main-ui.js").read_text(encoding="utf-8")
    assert 'console.error("Lumi interaction contract initialization failed", error);' in text
    assert "catch (_) {}\n    }, 0);" not in text


def test_promotion_waits_for_real_session_completion_without_polling_window():
    text = (STATIC / "promotion-session-guard.js").read_text(encoding="utf-8")
    assert "const establishSessionPrimary = establishSession;" in text
    assert "const sessionReady = new Promise" in text
    assert "establishSessionWithPromotionReady" in text
    assert "const authenticated = await sessionReady;" in text
    assert "return loadPromotionAuthenticated();" in text
    assert "attempt <" not in text
    assert "setTimeout(resolve, 50)" not in text
