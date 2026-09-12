from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_video_mark_requires_resolved_variants_and_has_no_quality_cap():
    source = (ROOT / "browser-extension" / "content-v2.js").read_text(encoding="utf-8")
    assert 'type: "lumi-media-discover"' in source
    assert 'terminal === "variants_found"' in source
    assert "scheduleReadinessProbe" in source
    assert "readinessCache" in source
    assert "mediaIdentity" in source
    assert "READINESS_DEBOUNCE_MS" in source
    assert "INTRO_FULL_MS" in source
    assert "full-intro" in source
    assert "compact-mark" in source
    render_block = source[source.index("function renderVariants"):source.index("async function stageVariant")]
    assert "slice(0," not in render_block


def test_video_player_hover_is_not_a_restore_trigger():
    source = (ROOT / "browser-extension" / "content-v2.js").read_text(encoding="utf-8")
    assert 'trigger.addEventListener("mouseenter"' in source
    assert 'trigger.addEventListener("focus"' in source
    assert 'video.addEventListener("mouseenter"' not in source
    assert "pointermove" not in source[source.index("function ensureHost"):source.index("function positionHost")]


def test_bundled_content_script_must_match_extension_source():
    canonical = (ROOT / "browser-extension" / "content-v2.js").read_bytes()
    bundled = (ROOT / "static" / "browser-extension" / "chromium" / "content-v2.js").read_bytes()
    assert bundled == canonical
