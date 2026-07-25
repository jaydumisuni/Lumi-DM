# Lumi DM Floating Widget — Locked Design Contract

Status: **LOCKED**

This document is the source of truth for every future render, design, implementation, review, and regression test of the Lumi DM floating widget.

Do not redesign, simplify, expand, or reinterpret this behavior without explicit owner approval.

## Scope

The widget belongs only to **Lumi DM**.

It must not include THETECHGUY Software Builder controls, project health, dependencies, build targets, diagnostics dashboards, release controls, deployment tools, or unrelated system-management features.

## Approved visual direction

- Dark glass appearance.
- Blue and purple neon accents.
- Use the approved ring colors from the last accepted widget render.
- Rounded, premium, compact form.
- Proper Lumi logo and icon assets only.
- No hand-drawn-looking controls or arrows.
- The ring exists only in the floating widget, not in the main Lumi application.

## Window behavior

- User chooses the widget corner in Lumi settings.
- The chosen position is remembered.
- The widget does not steal focus unnecessarily.
- It must not cover or interfere with Windows taskbar, Start menu, system tray, notification area, popups, or other system controls.
- When the user activates a Windows system element or another application, that element may appear above the widget.
- The widget stays quiet in its chosen corner and does not force itself to the front.
- It must never open the full Lumi window merely because a download is captured.

## Widget states

The widget has these distinct states:

1. Idle connection monitor.
2. New-download confirmation panel.
3. Compact active-download monitor.
4. Expanded downloads view.
5. Paused download state.
6. Completed-download state.

## 1. Idle connection monitor

When no download is active:

- The widget remains compact.
- It shows the Lumi logo.
- It shows live connection speed/capacity information.
- The ring is not used as download progress.
- The ring may be inactive or use a very subtle idle animation.
- Clicking the idle widget may open the connection-capacity test or Lumi DM, according to the final interaction mapping.
- No old completed-download notification flood is allowed at Windows startup.

## 2. New download captured

A captured download may come from:

- Browser extension.
- Copied link.
- New Download inside Lumi.
- LinkGrabber.
- Operating-system catalogue.
- Firmware catalogue.
- Another application handing a URL to Lumi.

When a new download is captured:

- The compact corner widget **must expand automatically**.
- The full Lumi application must not open.
- This expanded state is the **new-download confirmation panel**.

### New-download confirmation content

The panel must show:

- Detected file name.
- Editable file name.
- File type.
- Expected size when available.
- Source/domain.
- Full URL or safe shortened URL view.
- Save folder.
- Browse button to choose another folder.
- Available storage space.
- Category when useful.
- Duplicate-file warning when applicable.

Useful options may include:

- Remember this folder for this file type.
- Start automatically next time.
- Add to queue.
- Start later.

Required actions:

- **Download now**.
- **Download later / Add to queue**.
- **Cancel**.

The user must be able to rename the file and choose exactly where it will be saved before the download starts.

## 3. Compact active-download monitor

After the user presses **Download now**:

- The confirmation panel shrinks back to the compact widget.
- The circular ring becomes the only progress bar.
- There must be no separate horizontal progress bar.

The compact widget shows only:

- File name.
- Download speed.
- Percentage.
- Circular progress ring.
- Pause/play control inside the ring.
- Tiny download-switch control when multiple downloads are active.
- Expand/collapse arrow.

### Circular ring behavior

- The ring fills clockwise according to download percentage.
- While downloading, the icon inside the ring is **Pause**.
- While paused, the icon inside the ring is **Play**.
- When complete, the ring becomes full and the icon changes to a green checkmark.
- The approved ring colors are retained.

### Long file names

- The filename area has a fixed width.
- The widget must not grow wider for a long filename.
- Long names scroll smoothly inside their own area.
- The motion loops continuously like text travelling through a subway/train destination display.
- Only the filename scrolls; the rest of the widget remains fixed.

### Multiple downloads

- The compact widget displays one selected download at a time.
- A tiny adjacent switch control cycles through active downloads.
- It may show a small position indicator such as `1 of 3`.
- Switching updates the filename, speed, percentage, ring progress, and pause/play state.
- This switch control is separate from the expand/collapse arrow.

## 4. Arrow and expanded downloads view

The arrow is the user-controlled expand/collapse control.

- In compact mode, it points up to expand.
- In expanded mode, it points down to return to compact mode.
- The arrow must be a clean, properly rendered chevron—not a rough drawing.

When expanded manually, the widget shows the downloads view without opening the full Lumi application.

### Expanded sections

- **Downloading**.
- **Downloaded**.
- **Queued / waiting**.

The list scrolls internally without a visible Windows-style scrollbar.

### Active download rows

Each active item may show:

- File name.
- Speed.
- Percentage.
- Circular progress ring.
- Pause/resume inside the ring.
- Downloaded size / total size.
- Remaining time.
- Cancel action.

### Completed download rows

Each completed item shows:

- File name.
- Completion time.
- File size.
- Full ring.
- Green checkmark inside the ring.

Completed ring interaction:

- Clicking the completed ring opens the file location in Windows Explorer and selects the file.
- A file-name click may open the file itself if that behavior is approved during implementation.
- Optional item actions may include Open file, Open location, and Remove from history.

## 5. Active-download expanded controls

When a current active download is expanded, useful controls may include:

- Full filename.
- Downloaded amount / total size.
- Time remaining.
- Pause or resume.
- Cancel.
- Open containing folder when available.
- Previous / next selected download.

The expanded view must not become a dashboard and must not contain unrelated categories, system diagnostics, build information, or project-management controls.

## 6. Completed state

When a selected download completes:

- The ring reaches 100%.
- The ring becomes fully filled.
- Pause/play changes to a green checkmark.
- Speed disappears.
- Status becomes **Completed**.
- Clicking the completed ring opens the file location.

If another active download exists:

- The widget may automatically switch to that download after a short delay.

If no active downloads remain:

- The widget returns to the idle connection-monitor state.

## Main application boundary

- The circular progress ring is for the floating widget only.
- Do not add the widget ring to the main Lumi application UI.
- The main Lumi application retains its own download-list design.

## Non-negotiable regression checks

Every implementation or render must prove:

- New download capture expands into folder/name confirmation.
- Full Lumi window does not open during capture.
- Save folder can be changed.
- File name can be edited.
- Download now shrinks back to compact monitoring mode.
- Ring is the only progress bar.
- Pause/play/checkmark states work inside the ring.
- Long filenames loop without changing widget width.
- Multiple downloads can be switched from the compact widget.
- Arrow expands and collapses the downloads view.
- Downloading, Downloaded, and Queued sections appear in expanded mode.
- Completed ring opens the file location.
- Taskbar and Windows system controls are never blocked.
- Approved visual colors and Lumi assets are preserved.

## Change control

Any change to this contract requires explicit owner approval.

Before producing another widget render or changing widget code, read this file first.
