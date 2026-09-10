from __future__ import annotations

import hashlib
from pathlib import Path
import re

from core.v2 import runtime as _runtime
from core.v2.models import TaskStatus


def verify_published_sha256(store, task_id: str, path: Path) -> None:
    task = store.get_task(task_id)
    if task is None:
        return
    firmware_hash = str(task.metadata.get("firmware_sha256") or "").strip().lower()
    os_hash = str(task.metadata.get("os_sha256") or "").strip().lower()
    expected = firmware_hash or os_hash
    if not re.fullmatch(r"[a-f0-9]{64}", expected):
        return
    kind = "firmware" if firmware_hash else "os"
    path = Path(path)
    if not path.is_file():
        task.status = TaskStatus.FAILED.value
        task.error = "Published SHA-256 could not be verified: completed file is missing"
        task.error_code = "PUBLISHED_SHA256_FILE_MISSING"
        task.metadata[f"{kind}_sha256_verified"] = False
        store.save_task(task)
        return
    task.status = TaskStatus.VERIFYING.value
    store.save_task(task)
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            hasher.update(chunk)
    actual = hasher.hexdigest()
    task.metadata[f"{kind}_sha256_actual"] = actual
    task.metadata[f"{kind}_sha256_verified"] = actual == expected
    if actual != expected:
        task.status = TaskStatus.FAILED.value
        task.error = "Completed file SHA-256 does not match the published digest"
        task.error_code = "PUBLISHED_SHA256_MISMATCH"
        store.save_task(task)
        store.append_event(task.id, f"{kind}_sha256_mismatch", {"expected": expected, "actual": actual})
        return
    task.status = TaskStatus.COMPLETED.value
    task.error = ""
    task.error_code = ""
    store.save_task(task)
    store.append_event(task.id, f"{kind}_sha256_verified", {"sha256": actual})


def install_artifact_integrity() -> None:
    current = _runtime.HTTPTransferRunner
    if getattr(current, "_lumi_artifact_integrity_wrapper", False):
        return

    class VerifiedArtifactHTTPTransferRunner(current):
        _lumi_artifact_integrity_wrapper = True

        def _complete_file(self, task, partial: Path, final: Path) -> None:
            super()._complete_file(task, partial, final)
            completed = self.store.get_task(task.id)
            if completed is None or completed.status != TaskStatus.COMPLETED.value:
                return
            verify_published_sha256(self.store, task.id, Path(completed.final_path))

    _runtime.HTTPTransferRunner = VerifiedArtifactHTTPTransferRunner
