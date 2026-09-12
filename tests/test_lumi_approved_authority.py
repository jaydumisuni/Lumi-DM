from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]


def test_single_product_authority_exists_and_old_competing_docs_are_absent():
    approved = ROOT / "LUMI_APPROVED.md"
    assert approved.is_file()
    text = approved.read_text(encoding="utf-8")
    assert "single product authority for Lumi DM" in text
    for relative in (
        "PICKUP.md",
        "docs/design/LUMI_APP_DESIGN_SPEC.md",
        "docs/design/LUMI_WIDGET_SPEC.md",
        "docs/design/OVERVIEW_VISUAL_ACCEPTANCE.md",
        "docs/TTG_APP_SHELL_STANDARD.md",
    ):
        assert not (ROOT / relative).exists(), relative


def test_readme_and_machine_shell_defer_to_single_authority():
    readme = (ROOT / "README.md").read_text(encoding="utf-8")
    assert "LUMI_APPROVED.md` is the only current product/design/behavior authority" in readme
    shell = json.loads((ROOT / "assets/ttg-app-shell-standard.json").read_text(encoding="utf-8"))
    assert shell["status"] == "approved-current"
    assert shell["derived_from"] == "LUMI_APPROVED.md"
    source_manifest = json.loads((ROOT / "SOURCE-MANIFEST.json").read_text(encoding="utf-8"))
    assert source_manifest["status"] == "approved-current"
    assert source_manifest["derived_from"] == "LUMI_APPROVED.md"
    assert "source_commit" not in source_manifest
    assert "package time" in source_manifest["source_commit_policy"]


def test_approved_contract_and_shell_agree_on_two_item_technician_group():
    text = (ROOT / "LUMI_APPROVED.md").read_text(encoding="utf-8")
    assert "contains **only** these two technician workspaces" in text
    assert "Queues, Categories, and LinkGrabber are general download-management tools and remain top-level" in text
    shell = json.loads((ROOT / "assets/ttg-app-shell-standard.json").read_text(encoding="utf-8"))
    assert shell["navigation"]["technician_sections"] == [
        "Mobile firmware", "Operating systems"
    ]
    assert shell["navigation"]["top_level_tools"] == [
        "Queues", "Categories", "LinkGrabber"
    ]


def test_workspace_hygiene_keeps_one_canonical_checkout_and_git_authority():
    text = (ROOT / "LUMI_APPROVED.md").read_text(encoding="utf-8")
    assert "one canonical Lumi checkout per machine" in text
    assert "/home/kratos/projects/Lumi-DM" in text
    assert "GitHub commit history is the machine-to-machine continuation authority" in text
    assert "do not copy whole project folders between machines" in text
    assert "remove the temporary local copy" in text
    assert "Never delete unique work merely to make the workspace look clean" in text
    ignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    assert ".worktrees/" in ignore
