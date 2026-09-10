from __future__ import annotations

from pathlib import Path

from core.v2 import runtime as _runtime
from core.v2.models import TaskStatus, utc_now
from core.v2.vault import delete_secret, hydrate_provider_secret

from . import samsung_fus


def _destroy_request_secret(task, attribute: str) -> None:
    reference = str(getattr(task.request, attribute, "") or "")
    if not reference:
        return
    try:
        if delete_secret(reference):
            setattr(task.request, attribute, "")
    except Exception:
        return


def finalize_samsung_package(store, task_id: str, encrypted: Path) -> None:
    task = store.get_task(task_id)
    if task is None:
        return
    marker = dict(task.metadata.get("samsung_fus_decrypt") or {})
    if not marker:
        return
    encrypted = Path(encrypted)

    # The signed FUS request is no longer useful once the encrypted payload has
    # completed. Destroy it before decryption so it cannot linger in the vault.
    _destroy_request_secret(task, "secret_headers_reference")

    provider_reference = str(task.request.provider_secret_reference or "")
    try:
        secret = hydrate_provider_secret(provider_reference)
        decrypt_key_hex = str(secret.get("samsung_decrypt_key") or "")
        if not decrypt_key_hex:
            raise RuntimeError("Samsung decrypt key is unavailable from the local vault")
    except Exception as exc:
        task.status = TaskStatus.FAILED.value
        task.error = f"Samsung firmware decryption failed: {exc}"
        task.error_code = "SAMSUNG_FUS_DECRYPT_KEY_UNAVAILABLE"
        task.post_process["samsung_fus"] = {"status": "failed", "warning": str(exc), "encrypted_path": str(encrypted)}
        store.save_task(task)
        store.append_event(task.id, "samsung_firmware_decrypt_failed", {"error": str(exc)[:500]})
        return

    task.status = TaskStatus.POST_PROCESSING.value
    task.post_process["samsung_fus"] = {"status": "decrypting", "encrypted_path": str(encrypted)}
    store.save_task(task)
    try:
        output = samsung_fus.decrypt_package(
            encrypted, decrypt_key_hex=decrypt_key_hex,
            encryption=int(marker.get("encryption") or 4),
        )
        if not output.is_file() or output.stat().st_size <= 0:
            raise RuntimeError("Samsung decryption produced no usable output")
        encrypted_size = encrypted.stat().st_size if encrypted.exists() else int(task.total_bytes or 0)
        output_size = output.stat().st_size
        if encrypted.exists() and encrypted.resolve() != output.resolve():
            encrypted.unlink()
        task.filename = output.name
        task.final_path = str(output)
        task.downloaded_bytes = output_size
        task.total_bytes = output_size
        task.progress_percent = 100.0
        task.status = TaskStatus.COMPLETED.value
        task.finished_at = utc_now()
        task.error = ""
        task.error_code = ""
        task.metadata["samsung_fus_decrypted"] = True
        task.metadata["samsung_encrypted_bytes"] = encrypted_size
        task.post_process["samsung_fus"] = {"status": "completed", "output": str(output)}
        if provider_reference:
            try:
                if delete_secret(provider_reference):
                    task.request.provider_secret_reference = ""
            except Exception:
                pass
        store.save_task(task)
        store.append_event(task.id, "samsung_firmware_decrypted", {"filename": output.name, "bytes": output_size})
    except Exception as exc:
        # Keep the encrypted decrypt-key reference on failure so a technician can
        # retry post-processing without re-downloading the multi-gigabyte package.
        task.status = TaskStatus.FAILED.value
        task.error = f"Samsung firmware decryption failed: {exc}"
        task.error_code = "SAMSUNG_FUS_DECRYPT_FAILED"
        task.post_process["samsung_fus"] = {"status": "failed", "warning": str(exc), "encrypted_path": str(encrypted)}
        store.save_task(task)
        store.append_event(task.id, "samsung_firmware_decrypt_failed", {"error": str(exc)[:500]})


def install_samsung_postprocess() -> None:
    current = _runtime.HTTPTransferRunner
    if getattr(current, "_lumi_samsung_fus_wrapper", False):
        return

    class SamsungFirmwareHTTPTransferRunner(current):
        _lumi_samsung_fus_wrapper = True

        def _complete_file(self, task, partial: Path, final: Path) -> None:
            super()._complete_file(task, partial, final)
            completed = self.store.get_task(task.id)
            if completed is None or not completed.metadata.get("samsung_fus_decrypt"):
                return
            finalize_samsung_package(self.store, task.id, final)

    _runtime.HTTPTransferRunner = SamsungFirmwareHTTPTransferRunner
