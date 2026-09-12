from pathlib import Path
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]


def test_approved_navigation_keeps_only_firmware_and_os_inside_technician():
    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "html.parser")
    group = soup.select_one(".nav-group")
    assert group is not None
    submenu = group.select_one(".nav-submenu")
    assert submenu is not None
    views = [button.get("data-view") for button in submenu.select("button[data-view]")]
    assert views == ["firmware", "operating_systems"]
    top_level = [button.get("data-view") for button in soup.select(".nav-list > button[data-view]")]
    assert top_level == ["overview", "downloads", "unfinished", "finished", "queues", "categories", "grabber"]


def test_overview_keeps_clear_completed_action_instead_of_categories_rewrite():
    primary = (ROOT / "static" / "main-ui-views.js").read_text(encoding="utf-8")
    bridge = (ROOT / "static" / "lumi-ui.js").read_text(encoding="utf-8")
    assert '<span>Clear Completed</span>' in primary
    assert 'clear.dataset.mainView = "categories"' not in bridge
    assert 'clear.removeAttribute("data-action")' not in bridge
