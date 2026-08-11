#!/usr/bin/env python3
"""Move the approved renderer's production boot after production state initialization."""
from __future__ import annotations

import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "static" / "lumi-approved-ui.js"
OLD_SHA = "1cf175f6960594df2f9680b5c8f11362b48c17c5f920c08cd0fa1364c3267280"
NEW_SHA = "20c4b67951132ca357f72d11c85e2d45383050ea61902e63980de130570cbff1"

source = TARGET.read_text(encoding="utf-8")
actual = hashlib.sha256(source.encode("utf-8")).hexdigest()
if actual == NEW_SHA:
    print("production initialization order already corrected")
    raise SystemExit(0)
if actual != OLD_SHA:
    raise SystemExit(f"refusing to patch unexpected approved renderer SHA {actual}")

boot = '''  if (preview) { applyFixtures(); render(); } else {\n    state.downloads=[]; state.queues=[]; state.categories=[]; state.links=[]; state.firmware=[]; state.os=[];\n    render(); loadProduction();\n  }\n\n  const production = { firmwareFilters:{}, osFilters:{} };\n'''
source = source.replace(boot, '  const production = { firmwareFilters:{}, osFilters:{} };\n', 1)
loader = '''  async function loadProduction(){\n    const calls = [\n      ["/api/v2/tasks", data=>state.downloads = (data.tasks||[]).map(normalizeDownload)],\n      ["/api/v4/queues", data=>state.queues = (data.queues||[]).map(normalizeQueue)],\n      ["/api/v4/categories", data=>state.categories = data.categories||[]],\n      ["/api/v4/linkgrabber", data=>state.links = data.links||[]],\n      ["/api/settings", data=>state.settings = {...state.settings,...data}],\n    ];\n    await Promise.allSettled(calls.map(async ([url,apply])=>{ const r=await fetch(url); if(!r.ok) throw new Error(url); apply(await r.json()); }));\n    await Promise.allSettled([loadFirmware(), loadOs(), loadExtensionClients()]);\n    render();\n    setInterval(refreshProduction, 1500);\n  }\n'''
replacement = loader + '''\n  if (preview) {\n    applyFixtures();\n    render();\n  } else {\n    state.downloads=[]; state.queues=[]; state.categories=[]; state.links=[]; state.firmware=[]; state.os=[];\n    render();\n    loadProduction();\n  }\n'''
if loader not in source:
    raise SystemExit("approved loadProduction block not found")
source = source.replace(loader, replacement, 1)
actual = hashlib.sha256(source.encode("utf-8")).hexdigest()
if actual != NEW_SHA:
    raise SystemExit(f"corrected renderer SHA mismatch {actual} != {NEW_SHA}")
TARGET.write_text(source, encoding="utf-8")
print("approved renderer production initialization order corrected")
