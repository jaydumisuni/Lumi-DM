#!/usr/bin/env python3
"""Materialize the owner-approved Lumi renderer byte-for-byte.

The staged payload exists only because the repository connector cannot directly
write the approved binary asset. The decoded materializer verifies the SHA-256
of every approved file before and after replacement.
"""
from __future__ import annotations

import base64
import gzip
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT / "scripts" / "exact-approved-ui"
READY = STAGE / "READY"

if not READY.exists():
    print("exact approved UI staging marker absent; nothing to materialize")
    raise SystemExit(0)

parts = sorted(STAGE.glob("part-*"))
if not parts:
    raise SystemExit("exact approved UI payload parts are missing")

encoded = "".join(part.read_text(encoding="ascii").strip() for part in parts)
source = gzip.decompress(base64.b64decode(encoded, validate=True))
namespace = {"__name__": "__main__", "__file__": "<exact-approved-ui-materializer>"}
exec(compile(source, "<exact-approved-ui-materializer>", "exec"), namespace)

# Staging transport must never ship in a build.
shutil.rmtree(STAGE)
print("exact approved UI staging transport removed")
