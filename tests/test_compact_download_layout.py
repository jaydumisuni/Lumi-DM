from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_canonical_compact_download_table_keeps_actions_in_viewport() -> None:
    css = (ROOT / "static" / "compact-desktop.css").read_text(encoding="utf-8")
    assert ".ttg-desktop #view-downloads .lumi-table-head" in css
    assert ".ttg-desktop #view-downloads .lumi-row" in css
    assert "min-width:0" in css
    assert "grid-template-columns:minmax(0,1.65fr) 70px 64px minmax(92px,.8fr) 66px 36px" in css
    assert ".ttg-desktop #view-downloads .lumi-row-action{width:30px;height:30px}" in css


def test_canonical_compact_finished_table_keeps_action_in_viewport() -> None:
    css = (ROOT / "static" / "compact-desktop.css").read_text(encoding="utf-8")
    assert "#view-finished .lumi-table-head" in css
    assert "grid-template-columns:minmax(0,1.7fr) 68px 92px minmax(0,1fr) 36px" in css
