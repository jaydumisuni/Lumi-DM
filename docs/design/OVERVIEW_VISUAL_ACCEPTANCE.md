# Lumi DM Overview — Visual Acceptance Record

Status: **IMPLEMENTATION NOT YET APPROVED**

This record separates the approved Overview design from the current repository implementation. A design note must never be treated as proof that the application has been implemented or visually verified.

## Approved visual reference

The owner-approved Overview screen has:

- A full-width top title bar showing only `THETECHGUY TOOL`.
- Search and native window controls on the right.
- The approved Lumi logo in the left sidebar.
- Navigation: Overview, All Downloads, Unfinished, Finished.
- A collapsible `TECHNICIAN` group containing Mobile Firmware, Operating Systems, Queues, Categories, and LinkGrabber.
- Flexible empty sidebar space below LinkGrabber.
- `STORAGE LEFT` docked to the absolute bottom of the sidebar.
- No full-width application footer.
- No `Lumi Download Manager` or version text at the bottom.
- Overview cards for Total Downloads, Downloading, Completed, and Queued.
- Download-speed activity, Downloads-by-status, Recent Downloads, and Quick Actions panels.
- Main-application download progress rendered with horizontal progress bars. Floating-widget rings must not be reused as main-app download controls.

## Visual/source inspection performed

The current repository shell and Overview source were inspected in:

- `static/index.html`
- `static/app.js`
- `static/app.css`

## Current implementation mismatches

The current implementation does **not** yet match the approved Overview:

1. The sidebar contains a `Lumi / Download Manager` branding block rather than the exact approved sidebar treatment.
2. The repository has no full-width top title bar containing only `THETECHGUY TOOL`.
3. The Technician navigation is not implemented as the approved collapsible dropdown.
4. Queues, Categories, and LinkGrabber are separated under an `Organise` label rather than remaining inside Technician.
5. The sidebar footer currently shows connection state and current speed, not the approved `STORAGE LEFT` card.
6. Storage Left is therefore not docked at the absolute bottom of the sidebar.
7. The implemented Overview uses Active, Completed, Waiting, and Warnings cards rather than Total Downloads, Downloading, Completed, and Queued.
8. The implemented Overview uses Recent Downloads plus Current Activity/System Summary rather than the approved dashboard arrangement.
9. The current source still exposes a Diagnostics view, which is outside the approved Lumi main-app navigation.

## Acceptance rule

The Overview implementation may only be marked **VISUALLY APPROVED** after all of the following are complete:

1. Actual application source is changed.
2. The application is launched or rendered from that source.
3. A screenshot of the running result is compared with the approved reference.
4. Every visible mismatch is recorded and corrected.
5. Only then is the implementation status changed to approved.

Until that process is completed, the correct status is:

**Approved design; implementation pending visual acceptance.**
