# THETECHGUY App Shell Standard — Lumi

Lumi follows `assets/ttg-app-shell-standard.json` (`ttg-app-shell-v2`) as the locked desktop shell contract. The application owns a frameless Electron window; Builder packages that source without replacing the title bar or injecting another application shell.

The right-side title-bar order is notification bell, settings gear, separator, minimize, maximize/restore, close. Settings has one entry point through the gear. Appearance offers System, Dark, and Light. Settings and diagnostics are not normal sidebar destinations.

The Technician group contains Mobile Firmware, Operating Systems, Queues, Categories, and LinkGrabber. The advanced diagnostics workspace remains present but hidden from the ordinary sidebar and is reached only through **Gear → Advanced diagnostics**. It includes runtime health, database backup and repair, missing-file detection, and the other bounded diagnostic/recovery functions exposed by Lumi.

Builder owns packaging metadata and generated package manifests. The source repository keeps `techguy-build.json`, application source, static assets, tests, and release metadata; it does not commit Builder caches, Node environments, generated Electron `package.json`, installer engines, signing keys, or release credentials.
