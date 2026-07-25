# Lumi DM — Locked Main Application Design Specification

Status: **LOCKED**

This document is the source of truth for the Lumi DM main application design. It is separate from `LUMI_WIDGET_SPEC.md`, which controls only the floating widget.

Before rendering, redesigning, or implementing the Lumi DM interface, read this file first. Do not introduce visual or functional changes that conflict with it without explicit owner approval.

## 1. Product identity

Lumi DM is a **download manager** built as a THETECHGUY TOOL.

It must never be mixed with THETECHGUY Software Builder or any unrelated project.

Do not add Builder concepts such as:

- project health
- build controls
- dependencies
- installer creation
- project storage
- GitHub release management
- project status

## 2. Locked header structure

The top header contains only:

**THETECHGUY TOOL**

Do not repeat the Lumi logo or the words `Lumi DM` in the top header.

The product identity already appears in the main branded area below:

- Lumi character/logo
- `Lumi`
- `DOWNLOAD MANAGER`

Therefore the application must not duplicate Lumi branding in the header or sidebar.

## 3. Main visual structure

The approved hierarchy is:

1. top header: `THETECHGUY TOOL`
2. main Lumi identity panel
3. application navigation and page content

The current workflow and page structure should be preserved and polished, not replaced with a completely different application.

## 4. Background and glass treatment

Use the supplied THETECHGUY DIGITAL SOLUTIONS circuit-board artwork as the application-wide background.

Required layer order:

1. THETECHGUY background artwork
2. dark soft overlay
3. true glassmorphism panels
4. content and controls

The artwork must:

- remain visible behind every page
- fade in subtly like the original Lumi application
- not overpower text or controls
- show naturally through glass panels
- not be replaced by AI-generated scenery
- not be limited to Settings or a single page

Panels must look like real glass, not plain transparent rectangles.

## 5. Colour and lighting direction

Keep the approved Lumi visual language:

- deep black/navy base
- purple and electric-blue glow
- soft neon edge lighting
- clean white primary text
- restrained gradients
- rounded modern glass panels

Do not randomly recolour or restyle the application.

The circular progress-ring colours approved for the floating widget belong to the widget only. Do not introduce those rings as the main application's general progress treatment unless separately approved.

## 6. Sidebar

Do not add a second Lumi branding block in the sidebar.

The sidebar begins with navigation because the main identity is already established above.

No duplicate:

- Lumi logo
- `Lumi DM`
- `THETECHGUY TOOL`

Navigation should remain clean, modern, and easy to scan.

## 7. Operating Systems page

The approved direction is multiple downloadable OS cards with invisible/smooth scrolling.

Each OS entry must include:

- correct platform logo
- version/build information
- clear Download button

Coverage requirements:

- Windows: multiple versions and builds
- macOS: archive plus current/latest releases, not stopping at Big Sur
- Linux: multiple distributions/versions as applicable

The user chooses a version, scrolls through available results, and starts the download directly.

Do not show a visible default Windows-style scrollbar.

## 8. Firmware page

Keep the accepted layout, but the data must be complete and searchable.

Requirements:

- broad device database, not only a few Apple models
- search must work
- returned results must be verified
- download actions must work

## 9. Technician section

Technician functions must be collapsible and accessed through a dropdown-style structure rather than permanently occupying excessive space.

## 10. Storage information

Show download-relevant storage information such as remaining disk space.

A ring or pie-style visualization may be used for storage left, provided it fits the approved design.

Do not show Builder-style project storage information.

## 11. Scrolling and cards

Use smooth internal scrolling where needed.

Scrollbars should remain visually hidden while scrolling remains fully functional.

Pages may contain multiple cards and entries without making the interface feel crowded.

## 12. Main application versus floating widget

The main application and widget are separate surfaces.

- Main app: full download manager, browsing, history, catalogues, settings, queues, and download management.
- Floating widget: compact monitoring, new-download confirmation, progress ring, and quick download interactions.

The widget's progress ring is not a required main-app design element.

Consult `docs/design/LUMI_WIDGET_SPEC.md` for all widget behaviour.

## 13. Design discipline

The old Lumi screenshots are implementation references, not instructions to invent a new product.

Rule:

**Preserve the workflow. Improve the polish. Do not redesign the application into something unrelated.**

Before claiming a design or implementation is complete:

- compare it visually with this specification
- verify branding is not duplicated
- verify no Builder features were introduced
- verify buttons and scrolling are present
- verify the background and glass layers are correct
- verify functionality rather than relying only on appearance

## 14. Change control

This specification may only be changed after explicit owner approval.

Any future render, implementation, or refactor that conflicts with this file is considered design drift and must be corrected.