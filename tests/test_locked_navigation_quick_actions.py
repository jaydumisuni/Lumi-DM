from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]


def test_locked_navigation_keeps_general_tools_above_two_item_technician_group():
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "html.parser")
    group = soup.select_one(".nav-group")
    assert group is not None
    submenu = group.select_one(".nav-submenu")
    assert submenu is not None
    views = [button.get("data-view") for button in submenu.select("button[data-view]")]
    assert views == ["firmware", "operating_systems"]
    top_level = [button.get("data-view") for button in soup.select(".nav-list > button[data-view]")]
    assert top_level[-3:] == ["queues", "categories", "grabber"]
    group_index = list(soup.select_one(".nav-list").children).index(group)
    for view in ("queues", "categories", "grabber"):
        button = soup.select_one(f".nav-list > button[data-view={view}]")
        assert button is not None
        assert list(soup.select_one(".nav-list").children).index(button) < group_index


def test_overview_keeps_clear_completed_action_instead_of_categories_rewrite():
    primary = (ROOT / "static" / "main-ui-views.js").read_text(encoding="utf-8")
    bridge = (ROOT / "static" / "lumi-ui.js").read_text(encoding="utf-8")
    assert '<span>Clear Completed</span>' in primary
    assert 'clear.dataset.mainView = "categories"' not in bridge
    assert 'clear.removeAttribute("data-action")' not in bridge
