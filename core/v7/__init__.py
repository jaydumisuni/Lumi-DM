"""Lumi correction campaign runtime layer.

This package owns the post-RC architectural corrections from issue #8. It is
installed after the existing V4/V5/V6 services so it can converge old surfaces
onto one Runtime without forking another engine.
"""
from .runtime_contract import install_correction_campaign as _install_runtime_contract
from .desktop_auth import install_desktop_auth
from .media_contract import install_media_contract


def install_correction_campaign(app) -> None:
    _install_runtime_contract(app)
    install_desktop_auth(app)
    install_media_contract(app)


__all__ = ["install_correction_campaign"]
