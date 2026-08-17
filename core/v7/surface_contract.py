"""Converge browser handoff state onto the existing Lumi widget surface."""
from __future__ import annotations

from core.v2.models import TaskStatus


PENDING_QUEUE_ID = "browser-pending"


def _ensure_pending_queue(runtime) -> None:
    if runtime.store.get_queue(PENDING_QUEUE_ID) is not None:
        existing = runtime.store.get_queue(PENDING_QUEUE_ID) or {}
        if existing.get("active"):
            runtime.queue.update_queue(PENDING_QUEUE_ID, active=False)
        return
    runtime.queue.create_queue(
        "Browser captures",
        queue_id=PENDING_QUEUE_ID,
        max_running=1,
        active=False,
    )


def install_surface_contract(_app) -> None:
    from . import runtime_contract

    if getattr(runtime_contract.dispatch_rpc, "_lumi_surface_contract", False):
        return
    original = runtime_contract.dispatch_rpc

    def dispatch(app, method, params):
        runtime = runtime_contract._runtime()
        if str(method or "") == "browser.capture":
            requested_queue = str((params or {}).get("queue_id") or "default")
            result = original(app, method, params)
            task_id = str((result.get("task") or {}).get("id") or "")
            task = runtime.get_task(task_id)
            if task is None:
                return result
            _ensure_pending_queue(runtime)
            task.metadata["browser_requested_queue"] = requested_queue
            task.queue_id = PENDING_QUEUE_ID
            task.status = TaskStatus.QUEUED.value
            runtime.store.save_task(task)
            runtime.store.append_event(task.id, "browser.capture.widget_pending", {
                "pending_queue": PENDING_QUEUE_ID,
                "requested_queue": requested_queue,
            })
            result["task"] = task.to_dict(public=True)
            return result

        if str(method or "") == "browser.confirm":
            task_id = str((params or {}).get("task_id") or "")
            task = runtime.get_task(task_id)
            if task is not None and task.metadata.get("browser_capture_pending"):
                requested_queue = str(
                    (params or {}).get("queue_id")
                    or task.metadata.get("browser_requested_queue")
                    or "default"
                )
                if runtime.store.get_queue(requested_queue) is None:
                    requested_queue = "default"
                task.queue_id = requested_queue
                runtime.store.save_task(task)
            return original(app, method, params)

        return original(app, method, params)

    dispatch._lumi_surface_contract = True
    runtime_contract.dispatch_rpc = dispatch
    try:
        from . import browser_bridge
        browser_bridge.dispatch_rpc = dispatch
    except Exception:
        pass
