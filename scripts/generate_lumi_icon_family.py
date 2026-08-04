from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
# Owner-approved identity authority. Renderer lockups may use other approved
# images, but every application/extension/platform icon is derived from this
# exact resource and no generated icon is ever used as the next source.
SOURCE = ROOT / "Resouces" / "download manager logo.png"
PNG_SIZES = (16, 24, 32, 48, 64, 96, 128, 192, 256, 512, 1024)
ICO_SIZES = (16, 24, 32, 48, 64, 96, 128, 256)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def remove_file(path: Path) -> None:
    if path.is_file() or path.is_symlink():
        path.unlink()


def clean_obsolete_icons() -> list[str]:
    """Remove every generated/cached identity before recreating the family."""
    removed: list[str] = []
    patterns = (
        "assets/windows/*.ico",
        "assets/macos/*.icns",
        "assets/linux/*.png",
        "assets/icons/*",
        "resources/*icon*.ico",
        "resources/*icon*.icns",
        "resources/*icon*.png",
        "static/favicon*.png",
        "static/favicon*.ico",
        "static/icon.png",
        "static/my_logo.png",
        "browser-extension/icons/*",
        "Resouces/*.ico",
        "Resouces/app-icon.png",
        "Resouces/icon*.png",
        "Resouces/my_logo.png",
    )
    source = SOURCE.resolve()
    for pattern in patterns:
        for path in ROOT.glob(pattern):
            if not path.is_file() or path.resolve() == source:
                continue
            removed.append(path.relative_to(ROOT).as_posix())
            remove_file(path)
    for directory in (ROOT / "assets" / "icons",):
        if directory.is_dir() and not any(directory.iterdir()):
            directory.rmdir()
    return sorted(set(removed))


def content_bounds(image: Image.Image) -> tuple[int, int, int, int]:
    bounds = image.getchannel("A").getbbox()
    return bounds or (0, 0, image.width, image.height)


def extract_mark(lockup: Image.Image) -> Image.Image:
    """Isolate the left Lumi emblem from the approved horizontal resource.

    The approved file is a horizontal lockup. Its left square is the icon mark;
    the right side is product wording. This geometry rule is deterministic and
    does not depend on an old icon, filename heuristic, OCR or manual crop.
    """
    source = lockup.crop(content_bounds(lockup))
    width, height = source.size
    if width >= round(height * 1.45):
        mark = source.crop((0, 0, min(width, height), height))
    else:
        mark = source
    return mark.crop(content_bounds(mark))


def square_icon(mark: Image.Image, size: int) -> Image.Image:
    cropped = mark.crop(content_bounds(mark)).copy()
    margin = max(1, round(size * 0.075))
    available = max(1, size - margin * 2)
    cropped.thumbnail((available, available), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - cropped.width) // 2
    y = (size - cropped.height) // 2
    canvas.alpha_composite(cropped, (x, y))
    return canvas


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def save_ico(mark: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    square_icon(mark, 256).save(path, "ICO", sizes=[(size, size) for size in ICO_SIZES])


def save_icns(mark: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    square_icon(mark, 1024).save(
        path,
        "ICNS",
        sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)],
    )


def generate() -> dict[str, object]:
    if not SOURCE.is_file():
        raise SystemExit(f"Owner-approved Lumi identity is missing: {SOURCE}")
    lockup = Image.open(SOURCE).convert("RGBA")
    if lockup.width < 128 or lockup.height < 96:
        raise SystemExit(f"Approved Lumi identity is unexpectedly small: {lockup.size}")
    mark = extract_mark(lockup)
    if mark.width < 48 or mark.height < 48:
        raise SystemExit(f"Could not isolate the approved Lumi mark: {mark.size}")

    removed = clean_obsolete_icons()
    generated: list[dict[str, object]] = []
    sized: dict[int, Image.Image] = {size: square_icon(mark, size) for size in PNG_SIZES}

    static = ROOT / "static"
    for size in (16, 24, 32, 48, 64, 96, 128, 192, 256, 512):
        path = static / f"favicon-{size}.png"
        save_png(sized[size], path)
        generated.append({"path": path.relative_to(ROOT).as_posix(), "size": size})
    save_png(sized[256], static / "icon.png")
    generated.append({"path": "static/icon.png", "size": 256})

    extension = ROOT / "browser-extension" / "icons"
    for size in (16, 32, 48, 128):
        path = extension / f"icon{size}.png"
        save_png(sized[size], path)
        generated.append({"path": path.relative_to(ROOT).as_posix(), "size": size})

    for path in (
        ROOT / "assets" / "windows" / "Lumi-DM.ico",
        ROOT / "assets" / "windows" / "app-icon.ico",
        ROOT / "resources" / "app-icon.ico",
        ROOT / "static" / "favicon.ico",
    ):
        save_ico(mark, path)
        generated.append({"path": path.relative_to(ROOT).as_posix(), "type": "ico"})

    for path in (
        ROOT / "assets" / "macos" / "Lumi-DM.icns",
        ROOT / "assets" / "macos" / "app-icon.icns",
        ROOT / "resources" / "app-icon.icns",
    ):
        save_icns(mark, path)
        generated.append({"path": path.relative_to(ROOT).as_posix(), "type": "icns"})

    for path in (
        ROOT / "assets" / "linux" / "Lumi-DM.png",
        ROOT / "assets" / "linux" / "app-icon.png",
        ROOT / "resources" / "app-icon.png",
    ):
        save_png(sized[512], path)
        generated.append({"path": path.relative_to(ROOT).as_posix(), "size": 512})

    report_files: list[dict[str, object]] = []
    for item in generated:
        path = ROOT / str(item["path"])
        report_files.append({**item, "bytes": path.stat().st_size, "sha256": sha256(path)})

    report = {
        "schemaVersion": 3,
        "source": SOURCE.relative_to(ROOT).as_posix(),
        "sourceDimensions": [lockup.width, lockup.height],
        "markDimensions": [mark.width, mark.height],
        "sourceSha256": sha256(SOURCE),
        "cropRule": "left-square-of-horizontal-owner-resource",
        "removedObsoleteIcons": removed,
        "generated": report_files,
    }
    report_path = ROOT / "build_config" / "lumi-icon-family.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def verify(report: dict[str, object]) -> None:
    generated = report.get("generated") or []
    if len(generated) < 25:
        raise SystemExit(f"Icon family is incomplete: {len(generated)} generated files")
    by_path = {str(item["path"]): item for item in generated}
    for item in generated:
        path = ROOT / str(item["path"])
        if not path.is_file() or path.stat().st_size <= 100:
            raise SystemExit(f"Generated icon is missing or empty: {path}")
        if sha256(path) != item["sha256"]:
            raise SystemExit(f"Generated icon hash mismatch: {path}")
    for size in (16, 24, 32, 48, 64, 96, 128, 192, 256, 512):
        with Image.open(ROOT / "static" / f"favicon-{size}.png") as image:
            if image.size != (size, size):
                raise SystemExit(f"Wrong favicon dimensions for {size}: {image.size}")
    for size in (16, 32, 48, 128):
        extension = ROOT / "browser-extension" / "icons" / f"icon{size}.png"
        with Image.open(extension) as image:
            if image.size != (size, size):
                raise SystemExit(f"Wrong extension icon dimensions for {size}: {image.size}")
        favicon = ROOT / "static" / f"favicon-{size}.png"
        if sha256(extension) != sha256(favicon):
            raise SystemExit(f"Extension and application identity differ at {size}px")
    with Image.open(ROOT / "assets" / "windows" / "Lumi-DM.ico") as image:
        if image.format != "ICO":
            raise SystemExit("Windows Lumi icon is not a real ICO file")
    required = {
        "assets/windows/Lumi-DM.ico",
        "resources/app-icon.ico",
        "browser-extension/icons/icon128.png",
        "static/favicon-256.png",
    }
    if not required.issubset(by_path):
        raise SystemExit(f"Required identity surfaces missing: {sorted(required - set(by_path))}")


if __name__ == "__main__":
    result = generate()
    verify(result)
    print(f"LUMI_ICON_SOURCE={result['source']}")
    print(f"LUMI_ICON_SOURCE_SHA256={result['sourceSha256']}")
    print(f"LUMI_ICON_MARK={result['markDimensions']}")
    print(f"LUMI_ICON_FILES={len(result['generated'])}")
    print("LUMI_ICON_FAMILY_VERIFIED")
