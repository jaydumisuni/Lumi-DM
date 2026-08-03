from __future__ import annotations

import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Resouces" / "my_logo.png"
PNG_SIZES = (16, 24, 32, 48, 64, 96, 128, 192, 256, 512, 1024)
ICO_SIZES = (16, 24, 32, 48, 64, 96, 128, 256)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def remove_file(path: Path) -> None:
    if path.is_file() or path.is_symlink():
        path.unlink()


def clean_obsolete_icons() -> list[str]:
    """Remove every derived icon; preserve only Resouces/my_logo.png."""
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
    )
    for pattern in patterns:
        for path in ROOT.glob(pattern):
            if path.resolve() == SOURCE.resolve() or not path.is_file():
                continue
            removed.append(path.relative_to(ROOT).as_posix())
            remove_file(path)
    for directory in (ROOT / "assets" / "icons",):
        if directory.is_dir() and not any(directory.iterdir()):
            directory.rmdir()
    return sorted(set(removed))


def content_bounds(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = image.getchannel("A")
    bounds = alpha.getbbox()
    return bounds or (0, 0, image.width, image.height)


def square_icon(source: Image.Image, size: int) -> Image.Image:
    cropped = source.crop(content_bounds(source))
    margin = max(1, round(size * 0.055))
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


def save_ico(source: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    base = square_icon(source, 256)
    base.save(path, "ICO", sizes=[(size, size) for size in ICO_SIZES])


def save_icns(source: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    base = square_icon(source, 1024)
    base.save(
        path,
        "ICNS",
        sizes=[(16, 16), (32, 32), (64, 64), (128, 128), (256, 256), (512, 512), (1024, 1024)],
    )


def generate() -> dict[str, object]:
    if not SOURCE.is_file():
        raise SystemExit(f"Canonical Lumi logo is missing: {SOURCE}")
    source = Image.open(SOURCE).convert("RGBA")
    if source.width < 64 or source.height < 64:
        raise SystemExit(f"Canonical Lumi logo is unexpectedly small: {source.size}")

    removed = clean_obsolete_icons()
    generated: list[dict[str, object]] = []

    sized: dict[int, Image.Image] = {size: square_icon(source, size) for size in PNG_SIZES}
    static = ROOT / "static"
    for size in (16, 24, 32, 48, 64, 96, 128, 192, 256, 512):
        path = static / f"favicon-{size}.png"
        save_png(sized[size], path)
        generated.append({"path": path.relative_to(ROOT).as_posix(), "size": size})
    save_png(sized[256], static / "icon.png")
    shutil.copy2(SOURCE, static / "my_logo.png")

    extension = ROOT / "browser-extension" / "icons"
    for size in (16, 32, 48, 128):
        path = extension / f"icon{size}.png"
        save_png(sized[size], path)
        generated.append({"path": path.relative_to(ROOT).as_posix(), "size": size})

    windows_targets = (
        ROOT / "assets" / "windows" / "Lumi-DM.ico",
        ROOT / "assets" / "windows" / "app-icon.ico",
        ROOT / "resources" / "app-icon.ico",
        ROOT / "static" / "favicon.ico",
    )
    for path in windows_targets:
        save_ico(source, path)
        generated.append({"path": path.relative_to(ROOT).as_posix(), "type": "ico"})

    mac_targets = (
        ROOT / "assets" / "macos" / "Lumi-DM.icns",
        ROOT / "assets" / "macos" / "app-icon.icns",
        ROOT / "resources" / "app-icon.icns",
    )
    for path in mac_targets:
        save_icns(source, path)
        generated.append({"path": path.relative_to(ROOT).as_posix(), "type": "icns"})

    linux_targets = (
        ROOT / "assets" / "linux" / "Lumi-DM.png",
        ROOT / "assets" / "linux" / "app-icon.png",
        ROOT / "resources" / "app-icon.png",
    )
    for path in linux_targets:
        save_png(sized[512], path)
        generated.append({"path": path.relative_to(ROOT).as_posix(), "size": 512})

    report_files: list[dict[str, object]] = []
    for item in generated:
        path = ROOT / str(item["path"])
        report_files.append({**item, "bytes": path.stat().st_size, "sha256": sha256(path)})

    report = {
        "schemaVersion": 1,
        "source": SOURCE.relative_to(ROOT).as_posix(),
        "sourceDimensions": [source.width, source.height],
        "sourceSha256": sha256(SOURCE),
        "removedObsoleteIcons": removed,
        "generated": report_files,
    }
    report_path = ROOT / "build_config" / "lumi-icon-family.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    return report


def verify(report: dict[str, object]) -> None:
    generated = report.get("generated") or []
    if len(generated) < 24:
        raise SystemExit(f"Icon family is incomplete: {len(generated)} generated files")
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
        with Image.open(ROOT / "browser-extension" / "icons" / f"icon{size}.png") as image:
            if image.size != (size, size):
                raise SystemExit(f"Wrong extension icon dimensions for {size}: {image.size}")


if __name__ == "__main__":
    result = generate()
    verify(result)
    print(f"LUMI_ICON_SOURCE={result['source']}")
    print(f"LUMI_ICON_SOURCE_SHA256={result['sourceSha256']}")
    print(f"LUMI_ICON_FILES={len(result['generated'])}")
    print("LUMI_ICON_FAMILY_VERIFIED")
