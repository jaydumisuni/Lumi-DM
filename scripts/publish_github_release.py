#!/usr/bin/env python3
"""Delegate Lumi GitHub publication to THETECHGUY Software Builder.

Authentication is read by Builder only from GITHUB_TOKEN or GH_TOKEN. This
wrapper stores no credentials and contains no release implementation.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import subprocess
import sys


def parser() -> argparse.ArgumentParser:
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--repo',required=True)
    p.add_argument('--tag',required=True)
    p.add_argument('--title',required=True)
    p.add_argument('--notes',default='')
    p.add_argument('--notes-file',type=Path)
    p.add_argument('--asset',action='append',type=Path,required=True)
    p.add_argument('--target-commitish',default='')
    p.add_argument('--draft',action='store_true')
    p.add_argument('--prerelease',action='store_true')
    p.add_argument('--replace-assets',action='store_true')
    p.add_argument('--no-checksums',action='store_true',help='Disable Builder SHA-256 sidecars')
    p.add_argument('--confirm-repository',required=True)
    p.add_argument('--builder-root',type=Path,default=None,help='Trusted THETECHGUY Software Builder checkout; defaults to TTG_BUILDER_ROOT')
    return p

def main() -> int:
    a=parser().parse_args()
    root=a.builder_root or (Path(os.environ['TTG_BUILDER_ROOT']) if os.environ.get('TTG_BUILDER_ROOT') else None)
    if root is None:
        print('Set TTG_BUILDER_ROOT or pass --builder-root to the trusted Builder checkout.',file=sys.stderr); return 2
    script=(root.resolve()/'scripts'/'publish_github_release.py')
    if not script.is_file():
        print(f'Builder publisher not found: {script}',file=sys.stderr); return 2
    cmd=[sys.executable,str(script),'--repo',a.repo,'--tag',a.tag,'--title',a.title,'--confirm-repository',a.confirm_repository]
    if a.notes: cmd += ['--notes',a.notes]
    if a.notes_file: cmd += ['--notes-file',str(a.notes_file.resolve())]
    for asset in a.asset: cmd += ['--asset',str(asset.resolve())]
    if a.target_commitish: cmd += ['--target-commitish',a.target_commitish]
    if a.draft: cmd.append('--draft')
    if a.prerelease: cmd.append('--prerelease')
    if a.replace_assets: cmd.append('--replace-assets')
    if a.no_checksums: cmd.append('--no-sha256-sidecars')
    return subprocess.run(cmd,cwd=str(root.resolve()),env=os.environ.copy(),check=False).returncode

if __name__=='__main__': raise SystemExit(main())
