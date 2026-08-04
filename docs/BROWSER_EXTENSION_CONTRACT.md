# Lumi browser-extension contract

## Authority

`browser-extension/` is Lumi DM's only committed Chromium extension implementation.

No second extension may exist under `static/`, `resources/`, `electron/` or a Builder workspace. Packaging may copy the canonical directory, but it must not maintain another source tree.

## Ownership model

```text
Browser detects or intercepts
-> browser pauses only after Lumi persists a handoff
-> Lumi opens its normal setup surface
-> user chooses filename, folder, queue and start mode
-> Lumi becomes the task owner
-> browser copy is cancelled only after ownership transfer
```

If Lumi is unavailable or the handoff cannot be confirmed, the browser resumes the original download.

The extension and widget are clients of the Lumi task store. They are not separate download managers.

## Authentication

A bundled extension on the same computer uses `/api/security/local-extension` against loopback Lumi. It obtains and refreshes its local token automatically.

Pairing codes are reserved for external devices, mobile applications, tablets or another Lumi instance. The same-PC browser popup must not display a pairing-code workflow.

## Required inherited capabilities

The canonical extension preserves the proven old-Lumi architecture:

- ordinary download interception;
- safe pause, takeover and browser fallback;
- request headers, cookies, redirects and bounded POST-body capture;
- host-specific automatic/Lumi/browser rules;
- force-next and bypass-next commands;
- context-menu download, browser, repair, media and link-grab actions;
- authenticated-link repair capture;
- magnet and torrent interception;
- link scanning across the current page and open tabs;
- HLS, DASH, direct-media and DOM-video detection;
- yt-dlp-backed media inspection;
- recent Lumi download status.

## Media-quality contract

The media picker must present real backend evidence rather than guessing from filenames.

Each selectable row should use available fields:

- `format_id`;
- height/resolution;
- FPS;
- container;
- video codec;
- audio codec;
- bitrate;
- HDR/dynamic range;
- language;
- exact or approximate file size.

Rows are grouped as:

1. combined video and audio;
2. video-only formats that require audio merge;
3. audio-only formats;
4. subtitles/captions;
5. captured direct streams.

The selected `format_id`, audio/video mode and subtitle options are persisted into the browser handoff task. "Best available" is a visible user choice and must not silently replace a selected quality.

## Packaging and proof

Electron prepares the exact canonical extension directory. Tests must load the directory resolved by the production preparation module, not a convenient development copy.

Packaged proof must verify:

- automatic same-PC authentication;
- real Chromium pause and takeover;
- failure resume;
- exact-format media handoff;
- canonical icon identity;
- no duplicate extension tree in the package.
