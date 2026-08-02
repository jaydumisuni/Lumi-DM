#!/usr/bin/env python3
"""Materialize the owner-approved Lumi renderer byte-for-byte."""
from __future__ import annotations

import base64
import gzip
import hashlib
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT / "scripts" / "exact-approved-ui"
READY = STAGE / "READY"
EXPECTED = {
    "part-00": "7a6dcebf5ab2ac56fd6543612dd42d95616b473cc8d9b6872bfdd90531a6e324",
    "part-01": "dab5288f610d5e8b0a40dcb73c414da378426c42056cca55d3ec4d3b5361dedf",
    "part-02": "ea0970c256627bff883d466b3b2cd34c310fd7dc588339f00de4917040ba2435",
    "part-03": "265f1a47e68ce95f4730ee0a7b6955ecafedc56eabc022b1402603cc3634e99a",
    "part-04": "cfa1a3b3ada1ef4191ce2a1f7cb28a860cda414ff95d92b937e0ddc69f8627c2",
    "part-05": "9caf4920f496faaaa8c10d11bc45c2c0ba8bf45360964eec13a56e07e5a3cbf4",
    "part-06": "1df6bbfc36a474476e709187d427caa781fab2e9c21192cb962b9ad1e6fcd352",
    "part-07": "f801c033890d11dc9a346dd685124a484cd0c7291bc95d41d12f5db723d89185",
    "part-08": "2f324d49332de790e1d47d684f49d60cac057cc5546bce200a9a86d7c5f3c8aa",
    "part-09": "8bf19de57d9a2a3b724cd0a89e72562c229e91b45e689c42f39a3e320f2ed81d",
    "part-10": "bffcc145cdbe2b023cc12488c797c2ea1d1fd53eed325f99c9d192181e3f312d",
    "part-11": "f5fae796c7f54def0eeb5f2d70139fb8cf78734bc186e48db91cd7efe7b2fbcf",
    "part-12": "8aaac4f81ad60c8a4773f6bd7af6b0c8cd292ec97807957f8d9fd4bc021f1d64",
}

if not READY.exists():
    print("exact approved UI staging marker absent; nothing to materialize")
    raise SystemExit(0)

parts = sorted(STAGE.glob("part-*"))
if [part.name for part in parts] != list(EXPECTED):
    raise SystemExit(f"staged part set mismatch: {[part.name for part in parts]}")

texts: list[str] = []
errors: list[str] = []
for part in parts:
    text = part.read_text(encoding="ascii").strip()
    digest = hashlib.sha256(text.encode("ascii")).hexdigest()
    invalid = sorted(set(re.findall(r"[^A-Za-z0-9+/=]", text)))
    print(f"{part.name}: length={len(text)} sha256={digest} invalid={invalid!r}")
    if digest != EXPECTED[part.name]:
        errors.append(f"{part.name} expected {EXPECTED[part.name]} got {digest}")
    texts.append(text)
if errors:
    raise SystemExit("staged payload mismatch:\n" + "\n".join(errors))

encoded = "".join(texts)
source = gzip.decompress(base64.b64decode(encoded, validate=True))
namespace = {"__name__": "__main__", "__file__": "<exact-approved-ui-materializer>"}
exec(compile(source, "<exact-approved-ui-materializer>", "exec"), namespace)

shutil.rmtree(STAGE)
print("exact approved UI staging transport removed")
