from __future__ import annotations

import errno
from pathlib import Path

from core.v2 import http_transfer


def test_cross_device_finalize_copies_to_destination_then_atomically_replaces(tmp_path: Path, monkeypatch) -> None:
    source_dir = tmp_path / "source"
    target_dir = tmp_path / "target"
    source_dir.mkdir(); target_dir.mkdir()
    partial = source_dir / "payload.part"
    final = target_dir / "payload.bin"
    payload = b"cross-device-lumi-proof" * 8192
    partial.write_bytes(payload)

    real_replace = http_transfer.os.replace
    calls = []
    def fake_replace(source, destination):
        calls.append((Path(source), Path(destination)))
        if Path(source) == partial and Path(destination) == final:
            raise OSError(errno.EXDEV, "Invalid cross-device link")
        return real_replace(source, destination)

    monkeypatch.setattr(http_transfer.os, "replace", fake_replace)
    http_transfer._finalize_partial_file(partial, final, task_id="proof-task")

    assert final.read_bytes() == payload
    assert not partial.exists()
    assert not list(target_dir.glob("*.lumi-move-*"))
    assert calls[0] == (partial, final)
    assert calls[-1][1] == final


def test_non_exdev_replace_error_is_not_hidden(tmp_path: Path, monkeypatch) -> None:
    partial = tmp_path / "payload.part"
    final = tmp_path / "payload.bin"
    partial.write_bytes(b"x")
    def fail(*_args): raise PermissionError(errno.EACCES, "denied")
    monkeypatch.setattr(http_transfer.os, "replace", fail)
    try:
        http_transfer._finalize_partial_file(partial, final, task_id="proof-task")
    except PermissionError:
        pass
    else:
        raise AssertionError("non-EXDEV errors must propagate")
    assert partial.exists()
