# Lumi canonical icon-source contract

## Single source

The owner-approved source image is:

```text
Resouces/download manager logo.png
```

Its Git blob and SHA-256 are the identity authority. `static/assets/lumi-brand-transparent.png` may remain a renderer lockup when required by the approved UI, but it is not an icon-generation source.

## Generated surfaces

`scripts/generate_lumi_icon_family.py` derives the application mark once and generates:

- web favicons;
- Electron runtime PNG;
- Windows multi-resolution ICO;
- macOS ICNS;
- Linux PNG;
- taskbar and tray resources;
- widget and notification resources;
- browser-extension 16/32/48/128 PNGs;
- installer input assets.

All generated files must preserve aspect ratio, use transparent padding and be derived from the same isolated mark.

## Prohibited identity sources

The application, extension and Builder must not use:

- an old ghost carrying `DOWNLOAD MANAGER` text;
- cached Builder icons;
- `my_logo.png` aliases;
- handwritten SVG substitutes;
- separate extension artwork;
- a previous ICO as the next generation source;
- renderer screenshots or mockups as icon source.

## Verification

The generated report at `build_config/lumi-icon-family.json` records:

- canonical source path;
- source dimensions;
- source SHA-256;
- isolated-mark dimensions;
- every generated path, byte size and SHA-256.

Automated proof must fail when:

- the canonical source is missing;
- another source path appears in the Builder contract;
- a generated surface is missing;
- extension and application PNG hashes differ at the same size;
- Windows ICO is not a real multi-resolution ICO;
- a stale identity path remains tracked.

Visual owner approval is still required because hashes prove consistency, not that the selected artwork is the approved artwork.
