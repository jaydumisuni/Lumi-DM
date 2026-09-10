from __future__ import annotations

from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
WORKER = ROOT / "tools" / "git_autosync.py"


def git(cwd: Path, *args: str) -> str:
    result = subprocess.run(["git", *args], cwd=cwd, text=True, capture_output=True, check=True)
    return result.stdout.strip()


def setup_pair(tmp_path: Path):
    remote = tmp_path / "remote.git"
    subprocess.run(["git", "init", "--bare", "--initial-branch=main", str(remote)], check=True, capture_output=True)
    a = tmp_path / "a"
    b = tmp_path / "b"
    subprocess.run(["git", "clone", str(remote), str(a)], check=True, capture_output=True)
    for repo in (a,):
        git(repo, "config", "user.email", "test@example.invalid")
        git(repo, "config", "user.name", "Test")
    (a / "file.txt").write_text("base\n", encoding="utf-8")
    git(a, "add", "file.txt")
    git(a, "commit", "-m", "base")
    git(a, "push", "-u", "origin", "main")
    subprocess.run(["git", "clone", str(remote), str(b)], check=True, capture_output=True)
    git(b, "config", "user.email", "test@example.invalid")
    git(b, "config", "user.name", "Test")
    return remote, a, b


def run_worker(repo: Path):
    return subprocess.run([sys.executable, str(WORKER), "--repo", str(repo)], text=True, capture_output=True, timeout=30)


def test_clean_behind_fast_forwards(tmp_path: Path):
    remote, a, b = setup_pair(tmp_path)
    (a / "file.txt").write_text("remote\n", encoding="utf-8")
    git(a, "commit", "-am", "remote")
    git(a, "push")
    result = run_worker(b)
    assert result.returncode == 0, result.stderr
    assert git(b, "rev-parse", "HEAD") == git(a, "rev-parse", "HEAD")
    assert "FAST_FORWARD" in result.stdout


def test_dirty_tree_is_never_overwritten(tmp_path: Path):
    remote, a, b = setup_pair(tmp_path)
    before = git(b, "rev-parse", "HEAD")
    (b / "file.txt").write_text("local dirty\n", encoding="utf-8")
    (a / "file.txt").write_text("remote\n", encoding="utf-8")
    git(a, "commit", "-am", "remote")
    git(a, "push")
    result = run_worker(b)
    assert result.returncode == 0, result.stderr
    assert git(b, "rev-parse", "HEAD") == before
    assert (b / "file.txt").read_text(encoding="utf-8") == "local dirty\n"
    assert "DIRTY_SKIP_PULL" in result.stdout


def test_ahead_commit_is_pushed_automatically(tmp_path: Path):
    remote, a, b = setup_pair(tmp_path)
    (b / "local.txt").write_text("commit\n", encoding="utf-8")
    git(b, "add", "local.txt")
    git(b, "commit", "-m", "local")
    result = run_worker(b)
    assert result.returncode == 0, result.stderr
    remote_head = subprocess.run(["git", f"--git-dir={remote}", "rev-parse", "refs/heads/main"], text=True, capture_output=True, check=True).stdout.strip()
    assert remote_head == git(b, "rev-parse", "HEAD")
    assert "PUSHED" in result.stdout


def test_divergence_is_never_auto_merged(tmp_path: Path):
    remote, a, b = setup_pair(tmp_path)
    (b / "local.txt").write_text("local\n", encoding="utf-8")
    git(b, "add", "local.txt")
    git(b, "commit", "-m", "local")
    local_head = git(b, "rev-parse", "HEAD")
    (a / "remote.txt").write_text("remote\n", encoding="utf-8")
    git(a, "add", "remote.txt")
    git(a, "commit", "-m", "remote")
    git(a, "push")
    remote_head_before = subprocess.run(["git", f"--git-dir={remote}", "rev-parse", "refs/heads/main"], text=True, capture_output=True, check=True).stdout.strip()
    result = run_worker(b)
    assert result.returncode == 0, result.stderr
    assert git(b, "rev-parse", "HEAD") == local_head
    remote_head_after = subprocess.run(["git", f"--git-dir={remote}", "rev-parse", "refs/heads/main"], text=True, capture_output=True, check=True).stdout.strip()
    assert remote_head_after == remote_head_before
    assert "DIVERGED" in result.stdout
