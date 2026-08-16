"""Lumi correction campaign runtime layer.

This package owns the post-RC architectural corrections from issue #8. It is
installed after the existing V4/V5/V6 services so it can converge old surfaces
onto one Runtime without forking another engine.
"""
from .runtime_contract import install_correction_campaign

__all__ = ["install_correction_campaign"]
