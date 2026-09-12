import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load(root: Path):
    return json.loads((root / "manifest.json").read_text(encoding="utf-8"))


def test_shield_uses_mv3_dnr_without_history_permission():
    for root in (ROOT / "browser-extension", ROOT / "static/browser-extension/chromium"):
        manifest = load(root)
        assert "declarativeNetRequest" in manifest["permissions"]
        assert "history" not in manifest["permissions"]
        resources = manifest.get("declarative_net_request", {}).get("rule_resources", [])
        assert resources == [{"id": "lumi_shield", "enabled": True, "path": "shield-rules.json"}]


def test_static_shield_rules_are_curated_host_blocks_and_never_localhost():
    allowed = {
        "doubleclick.net", "googlesyndication.com", "googleadservices.com",
        "popads.net", "popcash.net", "propellerads.com", "onclicka.com",
        "adsterra.com", "exoclick.com", "trafficjunky.com",
    }
    rules = json.loads((ROOT / "browser-extension/shield-rules.json").read_text(encoding="utf-8"))
    assert rules
    for rule in rules:
        assert rule["action"]["type"] == "block"
        domains = set(rule["condition"].get("requestDomains", []))
        assert domains and domains <= allowed
        assert "localhost" not in domains and "127.0.0.1" not in domains
    bundled = json.loads((ROOT / "static/browser-extension/chromium/shield-rules.json").read_text(encoding="utf-8"))
    assert bundled == rules


def test_background_exposes_shield_state_and_site_bypass_messages():
    source = (ROOT / "browser-extension/background.js").read_text(encoding="utf-8")
    for name in ("lumi-shield-state", "lumi-shield-set-master", "lumi-shield-set-site"):
        assert name in source
    assert "updateSessionRules" in source
    assert "lumiShieldSiteAllow" in source
