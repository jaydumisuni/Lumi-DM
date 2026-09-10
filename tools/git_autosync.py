#!/usr/bin/env python3
"""Safe Git-backed workstation synchronization for Lumi development.

Only committed history is synchronized. Dirty worktrees are never modified,
merges/rebases are never performed automatically, and divergence is left for
explicit engineering review.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import subprocess
import sys
import time


def _git(repo: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess[str]:
    env = dict(os.environ)
    env["GIT_TERMINAL_PROMPT"] = "0"
    result = subprocess.run(
        ["git", *args], cwd=repo, env=env, text=True,
        capture_output=True, timeout=90, check=False,
    )
    if check and result.returncode != 0:
        message = (result.stderr or result.stdout or "git command failed").strip()
        raise RuntimeError(f"git {' '.join(args)}: {message}")
    return result


def _output(result: subprocess.CompletedProcess[str]) -> str:
    return result.stdout.strip()


def _branch(repo: Path) -> str:
    value = _output(_git(repo, "symbolic-ref", "--quiet", "--short", "HEAD", check=False))
    if not value:
        raise RuntimeError("detached HEAD; auto-sync requires a named branch")
    valid = _git(repo, "check-ref-format", "--branch", value, check=False)
    if valid.returncode != 0:
        raise RuntimeError("invalid current branch")
    return value


def _lock_path(repo: Path) -> Path:
    raw = _output(_git(repo, "rev-parse", "--git-path", "lumi-autosync.lock"))
    path = Path(raw)
    return path if path.is_absolute() else repo / path


class _Lock:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.acquired = False

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        try:
            if self.path.exists() and time.time() - self.path.stat().st_mtime > 600:
                self.path.unlink(missing_ok=True)
            fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                handle.write(f"pid={os.getpid()}\n")
            self.acquired = True
        except FileExistsError:
            print("LUMI_AUTOSYNC BUSY")
        return self

    def __exit__(self, exc_type, exc, tb):
        if self.acquired:
            self.path.unlink(missing_ok=True)


def _push(repo: Path, branch: str) -> bool:
    result = _git(
        repo, "push", "origin", f"HEAD:refs/heads/{branch}",
        check=False,
    )
    if result.returncode == 0:
        print(f"LUMI_AUTOSYNC PUSHED branch={branch}")
        return True
    message = (result.stderr or result.stdout).strip().replace("\n", " | ")
    print(f"LUMI_AUTOSYNC PUSH_BLOCKED branch={branch} detail={message[:600]}")
    return False


def sync(repo: Path, *, push_only: bool = False) -> int:
    repo = repo.resolve()
    if _git(repo, "rev-parse", "--is-inside-work-tree", check=False).returncode != 0:
        raise RuntimeError(f"not a Git worktree: {repo}")
    branch = _branch(repo)
    with _Lock(_lock_path(repo)) as lock:
        if not lock.acquired:
            return 0
        if push_only:
            _push(repo, branch)
            return 0

        fetch = _git(
            repo, "fetch", "--prune", "origin",
            f"+refs/heads/{branch}:refs/remotes/origin/{branch}",
            check=False,
        )
        remote_ref = f"refs/remotes/origin/{branch}"
        if fetch.returncode != 0 or _git(repo, "show-ref", "--verify", "--quiet", remote_ref, check=False).returncode != 0:
            # New branch: publishing committed history is safe; no local files are changed.
            if _push(repo, branch):
                _git(repo, "branch", "--set-upstream-to", f"origin/{branch}", branch, check=False)
                return 0
            detail = (fetch.stderr or fetch.stdout).strip().replace("\n", " | ")
            print(f"LUMI_AUTOSYNC FETCH_FAILED branch={branch} detail={detail[:600]}")
            return 2

        counts = _output(_git(repo, "rev-list", "--left-right", "--count", f"HEAD...origin/{branch}"))
        try:
            ahead, behind = (int(part) for part in counts.split())
        except Exception as exc:
            raise RuntimeError(f"could not parse ahead/behind counts: {counts!r}") from exc

        dirty = bool(_output(_git(repo, "status", "--porcelain", "--untracked-files=normal")))
        if ahead and behind:
            print(f"LUMI_AUTOSYNC DIVERGED branch={branch} ahead={ahead} behind={behind}")
            return 0

        if dirty:
            if ahead and not behind:
                _push(repo, branch)
            print(f"LUMI_AUTOSYNC DIRTY_SKIP_PULL branch={branch} ahead={ahead} behind={behind}")
            return 0

        if behind:
            _git(repo, "merge", "--ff-only", f"origin/{branch}")
            print(f"LUMI_AUTOSYNC FAST_FORWARD branch={branch} commits={behind}")
            return 0

        if ahead:
            _push(repo, branch)
            return 0

        print(f"LUMI_AUTOSYNC IN_SYNC branch={branch}")
        return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument("--push-only", action="store_true")
    args = parser.parse_args()
    try:
        return sync(Path(args.repo), push_only=args.push_only)
    except Exception as exc:
        print(f"LUMI_AUTOSYNC ERROR {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
