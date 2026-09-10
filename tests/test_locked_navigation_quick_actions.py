from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]


def test_locked_technician_group_contains_all_five_tool_workspaces():
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "html.parser")
    group = soup.select_one(".nav-group")
    assert group is not None
    submenu = group.select_one(".nav-submenu")
    assert submenu is not None
    views = [button.get("data-view") for button in submenu.select("button[data-view]")]
    assert views == ["firmware", "operating_systems", "queues", "categories", "grabber"]
    for view in ("queues", "categories", "grabber"):
        assert soup.select_one(f".nav-list > button[data-view={view}]") is None


def test_overview_keeps_clear_completed_action_instead_of_categories_rewrite():
    primary = (ROOT / "static" / "main-ui-views.js").read_text(encoding="utf-8")
    bridge = (ROOT / "static" / "lumi-ui.js").read_text(encoding="utf-8")
    assert '<span>Clear Completed</span>' in primary
    assert 'clear.dataset.mainView = "categories"' not in bridge
    assert 'clear.removeAttribute("data-action")' not in bridge
