#!/usr/bin/env python3
"""Clean and materialize the canonical Lumi icon family without redrawing artwork."""
from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "static" / "favicon-256.png"
WINDOWS = ROOT / "assets" / "windows"
SIZES = (16, 24, 32, 48, 64, 96, 128, 256)

image = Image.open(SOURCE).convert("RGBA")
width, height = image.size
alpha = image.getchannel("A")
seen: set[tuple[int, int]] = set()
components: list[list[tuple[int, int]]] = []

for y in range(height):
    for x in range(width):
        if (x, y) in seen or alpha.getpixel((x, y)) <= 8:
            continue
        queue = deque([(x, y)])
        seen.add((x, y))
        component: list[tuple[int, int]] = []
        while queue:
            px, py = queue.popleft()
            component.append((px, py))
            for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                if not (0 <= nx < width and 0 <= ny < height):
                    continue
                if (nx, ny) in seen or alpha.getpixel((nx, ny)) <= 8:
                    continue
                seen.add((nx, ny))
                queue.append((nx, ny))
        components.append(component)

if not components:
    raise SystemExit("canonical Lumi source icon contains no visible pixels")

main = max(components, key=len)
main_x = [point[0] for point in main]
main_y = [point[1] for point in main]
left, top, right, bottom = min(main_x), min(main_y), max(main_x) + 1, max(main_y) + 1

# Preserve all components that intersect the main mark's small expanded boundary.
# This retains deliberate disconnected glow/detail pixels while removing the known
# distant purple artifact at the right edge of the old source image.
keep: set[tuple[int, int]] = set()
for component in components:
    xs = [point[0] for point in component]
    ys = [point[1] for point in component]
    c_left, c_top, c_right, c_bottom = min(xs), min(ys), max(xs) + 1, max(ys) + 1
    intersects = c_left <= right + 8 and c_right >= left - 8 and c_top <= bottom + 8 and c_bottom >= top - 8
    if intersects:
        keep.update(component)

clean = Image.new("RGBA", image.size, (0, 0, 0, 0))
source_pixels = image.load()
clean_pixels = clean.load()
for x, y in keep:
    clean_pixels[x, y] = source_pixels[x, y]

bbox = clean.getbbox()
if bbox is None:
    raise SystemExit("canonical Lumi icon cleanup removed the whole mark")
mark = clean.crop(bbox)
scale = min(220 / mark.width, 220 / mark.height)
mark = mark.resize((round(mark.width * scale), round(mark.height * scale)), Image.Resampling.LANCZOS)
canonical = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
canonical.alpha_composite(mark, ((256 - mark.width) // 2, (256 - mark.height) // 2))

for size in SIZES:
    target = ROOT / "static" / f"favicon-{size}.png"
    canonical.resize((size, size), Image.Resampling.LANCZOS).save(target, optimize=True)

WINDOWS.mkdir(parents=True, exist_ok=True)
canonical.save(
    WINDOWS / "Lumi-DM.ico",
    sizes=[(size, size) for size in SIZES],
)
print("canonical Lumi icon family materialized from approved artwork")
