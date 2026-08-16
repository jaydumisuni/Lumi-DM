"""Attach browser-first media discovery to the canonical Lumi RPC dispatcher."""
from __future__ import annotations

from .media_resolver import discover_media


def install_media_contract(_app) -> None:
    from . import runtime_contract

    if getattr(runtime_contract.dispatch_rpc, "_lumi_media_contract", False):
        return
    original = runtime_contract.dispatch_rpc

    def dispatch(app, method, params):
        if str(method or "") == "media.discover":
            return discover_media(params if isinstance(params, dict) else {})
        return original(app, method, params)

    dispatch._lumi_media_contract = True
    runtime_contract.dispatch_rpc = dispatch
    try:
        from . import browser_bridge
        browser_bridge.dispatch_rpc = dispatch
    except Exception:
        pass
