"""Attach browser-first media discovery to the canonical Lumi RPC dispatcher."""
from __future__ import annotations

from .media_resolver import discover_media


def _browser_has_downloadable_observation(params: dict) -> bool:
    observations = params.get("observations")
    if not isinstance(observations, list):
        return False
    for item in observations:
        if not isinstance(item, dict):
            continue
        if str(item.get("kind") or "").lower() in {"subtitle", "caption"}:
            continue
        if str(item.get("url") or "").strip().startswith(("http://", "https://")):
            return True
    return False


def install_media_contract(_app) -> None:
    from . import runtime_contract

    if getattr(runtime_contract.dispatch_rpc, "_lumi_media_contract", False):
        return
    original = runtime_contract.dispatch_rpc

    def dispatch(app, method, params):
        if str(method or "") == "media.discover":
            payload = dict(params) if isinstance(params, dict) else {}
            # Browser observations are the signed-in/dynamic page truth. Once the
            # browser already identified downloadable media, do not independently
            # revisit that page from the desktop resolver and mix a second set of
            # candidates into the same list. The resolver remains a bounded
            # fallback only when browser discovery found no downloadable URL.
            if _browser_has_downloadable_observation(payload):
                payload["resolver_fallback"] = False
            return discover_media(payload)
        return original(app, method, params)

    dispatch._lumi_media_contract = True
    runtime_contract.dispatch_rpc = dispatch
    try:
        from . import browser_bridge
        browser_bridge.dispatch_rpc = dispatch
    except Exception:
        pass
