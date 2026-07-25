# Lumi DM — Locked Main Application Design Specification

Status: **DESIGN LOCKED — IMPLEMENTATION NOT YET VISUALLY APPROVED**

This document is the source of truth for the Lumi DM main application design. It is separate from `LUMI_WIDGET_SPEC.md`, which controls only the floating widget.

Before rendering, redesigning, or implementing the Lumi DM interface, read this file first. Do not introduce visual or functional changes that conflict with it without explicit owner approval.

A locked design is not proof that the repository implementation matches it. Implementation acceptance is tracked in `OVERVIEW_VISUAL_ACCEPTANCE.md` and requires inspection of a rendered application screen.

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

The product identity appears below through the approved Lumi logo/identity area.

## 3. Main visual structure

The approved hierarchy is:

1. top header: `THETECHGUY TOOL`
2. left navigation/sidebar with the approved Lumi logo area
3. application page content

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

The circular progress-ring colours approved for the floating widget belong to the widget only.

## 6. Sidebar

The approved sidebar order is:

- Overview
- All Downloads
- Unfinished
- Finished
- Technician dropdown
  - Mobile Firmware
  - Operating Systems
  - Queues
  - Categories
  - LinkGrabber

The Technician group must expand and collapse using its arrow/dropdown control.

The approved Lumi logo stays in the sidebar identity area. Do not replace, redraw, reinterpret, or substitute it with a different character.

### Storage Left placement — locked

The `STORAGE LEFT` card is anchored inside the sidebar at the **very bottom of the application window**.

Required behaviour:

- It remains inside the sidebar column only.
- It must not create a full-width footer.
- It must not make the bottom of the main content area taller.
- The area between `LinkGrabber` and `STORAGE LEFT` is flexible empty space.
- Moving the storage card must not move, resize, recolour, or redesign any other element.
- The card shows remaining capacity, total capacity, and the approved ring/pie visualization.

Do not display `Lumi Download Manager`, a version number, or other footer text along the bottom edge of the application.

## 7. Approved Overview page

The approved Overview page is a full dashboard summary of download activity.

### Top summary cards

Four cards appear across the top:

- Total Downloads
- Downloading
- Completed
- Queued

Each card includes:

- status icon
- main count
- short supporting label
- subtle activity sparkline

### Download Speed panel

The Download Speed panel includes:

- current download speed
- session selector
- recent speed graph
- download speed
- upload speed
- latency

### Downloads by Status panel

The status panel includes a donut/pie visualization and values for:

- Completed
- Downloading
- Queued
- Failed

This dashboard status chart is allowed because it summarizes categories; it is not a per-download progress ring.

### Recent Downloads panel

Recent downloads show:

- correct file/platform icon
- filename
- speed
- downloaded size / total size
- percentage as separate text
- pause/resume action

Per-download progress in the main application uses a **horizontal progress bar**. Do not use the floating widget’s circular progress ring for main-app download progress.

### Quick Actions panel

The approved quick actions are:

- New Download
- Add Link
- Open Folder
- Settings
- Manage Queues
- Clear Completed

### Overview exclusions

Do not add:

- Builder information
- diagnostics dashboards
- project status
- project storage
- release controls
- a bottom version/footer strip
- floating-widget layouts inside the Overview page

## 8. Operating Systems page

The approved direction is a searchable, filterable list/table with smooth hidden scrolling or pagination.

Required platform tabs:

- Windows
- macOS
- Linux

Useful filters include:

- Version
- Edition
- Architecture
- Channel
- Language

Each OS entry must include:

- correct platform logo
- version/build information
- edition
- architecture
- channel
- size
- clear Download button

Coverage requirements:

- Windows: multiple versions and builds
- macOS: archive plus current/latest releases, not stopping at Big Sur
- Linux: multiple distributions/versions as applicable

The user chooses a version and starts the download directly.

Do not show a visible default Windows-style scrollbar.

## 9. Firmware page

Keep the accepted layout, but the data must be complete and searchable.

Requirements:

- broad device database, not only a few Apple models
- search must work
- returned results must be verified
- download actions must work

Mobile Firmware belongs under the collapsible Technician section.

## 10. Technician section

Technician functions must be collapsible and accessed through the approved dropdown structure.

Firmware and Operating Systems remain inside the Technician group; they must not be moved outside it.

## 11. Storage information

Show download-relevant storage information such as remaining disk space.

A ring or pie-style visualization may be used only for the `STORAGE LEFT` capacity card and summary charts where approved.

Do not show Builder-style project storage information.

## 12. Scrolling and cards

Use smooth internal scrolling where needed.

Scrollbars should remain visually hidden while scrolling remains fully functional.

Pages may contain multiple cards and entries without making the interface feel crowded.

## 13. Main application versus floating widget

The main application and widget are separate surfaces.

- Main app: full download manager, browsing, history, catalogues, settings, queues, and download management.
- Floating widget: compact monitoring, new-download confirmation, circular progress ring, and quick download interactions.

Locked progress rule:

- Main application downloads: **horizontal progress bars**.
- Floating widget downloads: **circular progress ring**.
- Never copy the widget ring into main-app download rows.

Consult `docs/design/LUMI_WIDGET_SPEC.md` for all widget behaviour.

## 14. Design discipline

The old Lumi screenshots are implementation references, not instructions to invent a new product.

Rule:

**Preserve the workflow. Improve the polish. Do not redesign the application into something unrelated.**

When the owner requests one isolated visual change:

- change only that requested element
- preserve every other approved element and proportion
- do not regenerate the logo
- do not restructure the page
- do not alter unrelated spacing, colours, icons, panels, or content

Before claiming a design or implementation is complete:

- compare it visually with this specification
- verify the exact approved logo is used
- verify branding is not duplicated
- verify no Builder features were introduced
- verify main-app downloads use horizontal progress bars
- verify the Technician dropdown contains Firmware and Operating Systems
- verify `STORAGE LEFT` is anchored at the bottom of the sidebar only
- verify no bottom version/footer strip exists
- verify buttons and scrolling are present
- verify the background and glass layers are correct
- verify functionality rather than relying only on appearance
- render or launch the actual repository implementation and compare its screenshot with the approved reference
- record the result in the relevant visual acceptance file before using the word approved or complete

## 15. Change control

This specification may only be changed after explicit owner approval.

Any future render, implementation, or refactor that conflicts with this file is considered design drift and must be corrected.
