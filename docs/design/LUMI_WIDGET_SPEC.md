# Lumi DM Floating Widget — Locked Design Contract

Status: **LOCKED**

This document is the source of truth for every future render, implementation, review, and regression test of the Lumi DM floating widget.

Do not redesign, enlarge, simplify, or reinterpret it without explicit owner approval.

## Mandatory pre-render and pre-code rule

Before producing a widget mockup or changing widget code:

1. Read this file first.
2. Use the exact approved Lumi logo asset from the repository.
3. Do not redraw, replace, crop, stretch, or distort the logo.
4. Verify the regression checklist at the end.
5. Do not proceed from memory alone.

## Scope

The widget belongs only to **Lumi DM**.

It must never contain THETECHGUY Software Builder controls, project health, build targets, diagnostics dashboards, release controls, deployment tools, or unrelated system-management functions.

## Locked window dimensions

The current repository dimensions are approved and must remain the baseline:

- Compact widget: **240 × 66 px** before the user scale setting is applied.
- Expanded widget: **360 × 320 px** before the user scale setting is applied.

The existing scale preference may resize those dimensions proportionally. The design itself must not make the widget wider or taller than the established baseline.

## Approved visual direction

- Dark premium glass appearance.
- Blue and purple neon accents.
- Rounded compact form.
- Exact approved Lumi logo asset only.
- Clean rendered chevron for expand/collapse.
- No rough or hand-drawn-looking arrows.
- No horizontal progress bar anywhere inside the widget.
- Circular download-progress rings belong only to the widget, not the main Lumi application.

## Ring and percentage rule

The ring visually represents progress by filling clockwise.

While downloading:

- The ring contains only **Pause**.
- The numeric percentage appears as separate text **beside the ring**.
- The percentage must never appear inside or over the ring.

While paused:

- The ring retains its current progress.
- The ring contains only **Play**.
- The numeric percentage remains beside the ring.

When completed:

- The ring becomes completely filled.
- The ring contains only the green **checkmark**.
- No `100%` text is shown.
- Clicking the completed ring opens the file location in Explorer and selects the file.

## Window behavior

- The user chooses the screen corner in Lumi settings.
- The selected corner is remembered.
- The widget does not steal focus unnecessarily.
- It must not cover or interfere with the Windows taskbar, Start menu, system tray, notification area, or other system controls.
- When another application or Windows system element is activated, it may appear above the widget.
- The widget remains quiet in its selected corner and does not force itself forward.
- Capturing a download must never open the complete Lumi application.

## Widget states

The widget has these distinct states:

1. Idle connection monitor.
2. New-download confirmation panel.
3. Compact active-download monitor.
4. Expanded downloads view.
5. Paused-download state.
6. Completed-download state.

## Idle connection monitor

When no download is active:

- The widget stays compact.
- It shows the exact Lumi logo.
- It shows live connection speed/capacity information.
- The ring is inactive or has only a very subtle idle state.
- It does not replay old completed-download alerts after Windows starts.

## New download captured

A captured download may come from the browser extension, copied link, New Download, LinkGrabber, OS catalogue, firmware catalogue, or another application handing a URL to Lumi.

When a download is captured:

- The compact widget automatically expands into the new-download confirmation panel.
- The full Lumi application remains closed.

The confirmation panel must provide:

- detected file name;
- editable file name;
- file type;
- expected size when known;
- source/domain;
- URL or safe shortened URL;
- save folder;
- Browse control;
- available storage;
- category when useful;
- duplicate warning when applicable;
- Download now;
- Download later / Add to queue;
- Cancel.

The user must be able to rename the file and choose exactly where it will be saved before the download starts.

After **Download now**, the panel shrinks back to compact monitoring mode.

## Compact active-download monitor

The compact widget shows only:

- exact Lumi logo;
- looping filename;
- download speed;
- percentage beside the ring;
- circular progress ring;
- Pause/Play inside the ring;
- tiny download-switch control when multiple downloads are active;
- clean expand/collapse chevron.

### Long filenames

- The filename area has a fixed width.
- The widget never grows wider for a long filename.
- Only the filename scrolls.
- The filename loops smoothly like text moving through a train/subway destination display.
- Other controls remain fixed.

### Multiple downloads

- The compact widget displays one selected download at a time.
- The tiny adjacent switch control cycles through active downloads.
- It may display a position indicator such as `1/3`.
- Switching updates the filename, speed, percentage, ring fill, and Pause/Play state.
- The switch is separate from the expand/collapse chevron.

## Expanded downloads view

The chevron manually expands or collapses the widget without opening the full Lumi application.

Expanded sections:

- **Downloading**
- **Downloaded**
- **Queued**

The list scrolls internally without a visible Windows-style scrollbar.

### Downloading rows

Each downloading row may show:

- file icon;
- filename;
- speed;
- downloaded size / total size;
- percentage beside the ring;
- circular progress ring;
- Pause/Play inside the ring;
- cancel/more action.

No horizontal progress bar is allowed.

### Downloaded rows

Each completed row shows:

- file icon;
- filename;
- completion state/time when available;
- file size;
- full green ring;
- green checkmark.

Clicking the completed ring opens the file location.

### Queued rows

Each queued row may show:

- file icon;
- filename;
- expected size when known;
- Start/Resume;
- Cancel.

## Completed state

When the selected download completes:

- the ring becomes full;
- Pause/Play becomes a green checkmark;
- speed changes to **Completed**;
- percentage text disappears;
- clicking the ring opens the file location;
- another active download may become selected after a short delay;
- if no active download remains, the widget returns to idle connection monitoring.

## Main application boundary

- Widget downloads use circular progress rings.
- Main-application downloads use horizontal progress bars.
- Never copy the widget ring into the main Lumi application.

## Non-negotiable regression checklist

Every widget change must prove:

- this document was read first;
- compact size remains 240 × 66 px before scaling;
- expanded size remains 360 × 320 px before scaling;
- the exact repository Lumi logo is used without distortion;
- new-download capture opens filename/folder confirmation;
- the full Lumi application does not open during capture;
- file name and save folder are editable;
- Download now returns to compact mode;
- no horizontal progress bar exists in the widget;
- percentage appears beside active rings, never inside them;
- no percentage appears for a completed ring;
- Pause, Play, and checkmark states work inside the ring;
- long filenames loop without changing widget width;
- multiple downloads can be switched from compact mode;
- the chevron expands and collapses the widget;
- Downloading, Downloaded, and Queued sections work;
- completed-ring click opens the file location;
- taskbar and Windows system controls are not blocked;
- approved colors and assets are preserved.

## Change control

Any change to this contract requires explicit owner approval.
