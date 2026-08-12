from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CANONICAL = ROOT / "Resouces" / "my_logo.png"
MANIFEST = ROOT / "assets" / "branding-manifest.json"
CANONICAL_SHA256 = "6201010c970fee53ba3bf3649eeda407e7fba333d18a920f685329589042f7ce"

# Exact symbol crop recovered from the owner-approved Lumi source artwork.
# The text lockup below this rectangle is intentionally excluded from launcher,
# tray, favicon and browser-extension identity surfaces because the approved UI
# uses the ghost + L/download-arrow symbol as the compact product mark.
SYMBOL_CROP = (94, 0, 618, 924)

PNG_OUTPUTS = {
    # Web / desktop shell
    "static/favicon-16.png": 16,
    "static/favicon-32.png": 32,
    "static/favicon-48.png": 48,
    "static/favicon-96.png": 96,
    "static/favicon-192.png": 192,
    "static/favicon-256.png": 256,
    "static/favicon-512.png": 512,
    # Browser extension native icon family
    "browser-extension/icons/icon16.png": 16,
    "browser-extension/icons/icon48.png": 48,
    "browser-extension/icons/icon128.png": 128,
    # Android launcher family
    "android/app/src/main/res/mipmap-mdpi/ic_launcher.png": 48,
    "android/app/src/main/res/mipmap-hdpi/ic_launcher.png": 72,
    "android/app/src/main/res/mipmap-xhdpi/ic_launcher.png": 96,
    "android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png": 144,
    "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png": 192,
    # iOS AppIcon family
    "ios/AppIcon.appiconset/Icon-20@1x.png": 20,
    "ios/AppIcon.appiconset/Icon-20@2x.png": 40,
    "ios/AppIcon.appiconset/Icon-20@3x.png": 60,
    "ios/AppIcon.appiconset/Icon-29@1x.png": 29,
    "ios/AppIcon.appiconset/Icon-29@2x.png": 58,
    "ios/AppIcon.appiconset/Icon-29@3x.png": 87,
    "ios/AppIcon.appiconset/Icon-40@1x.png": 40,
    "ios/AppIcon.appiconset/Icon-40@2x.png": 80,
    "ios/AppIcon.appiconset/Icon-40@3x.png": 120,
    "ios/AppIcon.appiconset/Icon-60@2x.png": 120,
    "ios/AppIcon.appiconset/Icon-60@3x.png": 180,
    "ios/AppIcon.appiconset/Icon-76@1x.png": 76,
    "ios/AppIcon.appiconset/Icon-76@2x.png": 152,
    "ios/AppIcon.appiconset/Icon-83_5@2x.png": 167,
    # macOS iconset family
    "macos/icons.iconset/icon_16x16.png": 16,
    "macos/icons.iconset/icon_16x16@2x.png": 32,
    "macos/icons.iconset/icon_32x32.png": 32,
    "macos/icons.iconset/icon_32x32@2x.png": 64,
    "macos/icons.iconset/icon_128x128.png": 128,
    "macos/icons.iconset/icon_128x128@2x.png": 256,
    "macos/icons.iconset/icon_256x256.png": 256,
    "macos/icons.iconset/icon_256x256@2x.png": 512,
    "macos/icons.iconset/icon_512x512.png": 512,
    "macos/icons.iconset/icon_512x512@2x.png": 1024,
}

WINDOWS_ICO = "assets/windows/Lumi-DM.ico"
EXTENSION_SVG = "static/browser-extension/chromium/icon.svg"
ALL_GENERATED = tuple(PNG_OUTPUTS) + (WINDOWS_ICO, EXTENSION_SVG)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_path(path: Path) -> str:
    return sha256_bytes(path.read_bytes())


def canonical_symbol() -> Image.Image:
    raw = CANONICAL.read_bytes()
    actual = sha256_bytes(raw)
    if actual != CANONICAL_SHA256:
        raise RuntimeError(
            f"Canonical Lumi source changed: expected {CANONICAL_SHA256}, got {actual}. "
            "Do not regenerate identity assets until the new artwork is explicitly approved."
        )
    source = Image.open(io.BytesIO(raw)).convert("RGBA")
    if source.size != (631, 1077):
        raise RuntimeError(f"Unexpected canonical source dimensions: {source.size}")
    return source.crop(SYMBOL_CROP)


def render_symbol(symbol: Image.Image, size: int) -> Image.Image:
    # Preserve the approved mark's aspect ratio and safe transparent padding.
    # A 92% vertical content box keeps the neon glow clear of launcher edges.
    inner_h = max(1, round(size * 0.92))
    inner_w = max(1, round(symbol.width * inner_h / symbol.height))
    resized = symbol.resize((inner_w, inner_h), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    x = (size - inner_w) // 2
    y = (size - inner_h) // 2
    canvas.alpha_composite(resized, (x, y))
    return canvas


def png_bytes(image: Image.Image) -> bytes:
    out = io.BytesIO()
    image.save(out, format="PNG", optimize=True)
    return out.getvalue()


def write_png(path: Path, image: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(png_bytes(image))


def write_windows_ico(symbol: Image.Image) -> None:
    path = ROOT / WINDOWS_ICO
    path.parent.mkdir(parents=True, exist_ok=True)
    master = render_symbol(symbol, 256)
    master.save(
        path,
        format="ICO",
        sizes=[
            (16, 16), (20, 20), (24, 24), (32, 32), (40, 40),
            (48, 48), (64, 64), (128, 128), (256, 256),
        ],
    )


def write_extension_svg(symbol: Image.Image) -> None:
    icon = png_bytes(render_symbol(symbol, 96))
    encoded = base64.b64encode(icon).decode("ascii")
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">'
        '<image x="0" y="0" width="96" height="96" '
        'preserveAspectRatio="xMidYMid meet" '
        f'href="data:image/png;base64,{encoded}"/>'
        '</svg>\n'
    )
    path = ROOT / EXTENSION_SVG
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(svg, encoding="utf-8")


def update_manifest() -> None:
    brand = json.loads(MANIFEST.read_text(encoding="utf-8"))
    hashes = {path: sha256_path(ROOT / path) for path in ALL_GENERATED}

    brand["canonical_source"] = "Resouces/my_logo.png"
    brand["canonical_source_sha256"] = CANONICAL_SHA256
    brand["identity_rule"] = (
        "Every app-identity surface is generated from the owner-approved Lumi artwork. "
        "Semantic file, platform and action icons remain semantic because they convey function."
    )
    brand["generator"] = {
        "path": "tools/generate_lumi_identity.py",
        "canonical_symbol_crop_px": list(SYMBOL_CROP),
        "safe_content_height_percent": 92,
        "generated_asset_count": len(ALL_GENERATED),
    }
    brand["generated_identity_assets_sha256"] = hashes

    identity = brand.setdefault("verified_runtime_identity", {})
    representative = {
        "desktop_builder_icon_sha256": "static/favicon-256.png",
        "desktop_builder_logo_sha256": "static/favicon-96.png",
        "browser_extension_icon_sha256": EXTENSION_SVG,
        "windows_native_icon_sha256": WINDOWS_ICO,
        "browser_extension_native_reference_sha256": "browser-extension/icons/icon128.png",
        "android_launcher_reference_sha256": "android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png",
        "ios_launcher_reference_sha256": "ios/AppIcon.appiconset/Icon-60@3x.png",
        "macos_launcher_reference_sha256": "macos/icons.iconset/icon_512x512.png",
    }
    for key, path in representative.items():
        identity[key] = hashes[path]
    identity["evidence"] = [
        "Identity binaries are generated deterministically from Resouces/my_logo.png by tools/generate_lumi_identity.py.",
        "Every generated app-identity path is hash-locked under generated_identity_assets_sha256; representative runtime hashes are derived from those files after generation.",
    ]

    MANIFEST.write_text(json.dumps(brand, indent=2) + "\n", encoding="utf-8")


def generate() -> None:
    symbol = canonical_symbol()
    for relative, size in PNG_OUTPUTS.items():
        write_png(ROOT / relative, render_symbol(symbol, size))
    write_windows_ico(symbol)
    write_extension_svg(symbol)
    update_manifest()


def verify() -> None:
    brand = json.loads(MANIFEST.read_text(encoding="utf-8"))
    expected = brand.get("generated_identity_assets_sha256") or {}
    missing = sorted(set(ALL_GENERATED) - set(expected))
    if missing:
        raise RuntimeError(f"Manifest is missing generated identity paths: {missing}")
    failures = []
    for relative in ALL_GENERATED:
        path = ROOT / relative
        if not path.is_file():
            failures.append(f"missing: {relative}")
            continue
        actual = sha256_path(path)
        if actual != expected[relative]:
            failures.append(f"hash mismatch: {relative}: {actual} != {expected[relative]}")
    if failures:
        raise RuntimeError("\n".join(failures))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true", help="Regenerate all Lumi identity assets")
    parser.add_argument("--verify", action="store_true", help="Verify every generated identity hash")
    args = parser.parse_args()
    if not args.write and not args.verify:
        parser.error("use --write and/or --verify")
    if args.write:
        generate()
    if args.verify:
        verify()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
