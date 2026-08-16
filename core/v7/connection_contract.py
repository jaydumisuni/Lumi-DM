"""Final pre-engine enforcement for Lumi's canonical HTTP connection policy."""
from __future__ import annotations

from core.v2.models import TaskType

from .runtime_contract import CANONICAL_HTTP_CONNECTIONS


def install_connection_contract(_app) -> None:
    from . import runtime_contract

    runtime = runtime_contract._runtime()
    if getattr(runtime.queue, "_lumi_v7_connection_contract", False):
        return
    runtime.queue._lumi_v7_connection_contract = True
    original_starter = runtime.queue.starter

    def starter(task_id: str) -> None:
        task = runtime.get_task(task_id)
        if task is not None and task.type == TaskType.HTTP.value:
            task.connections = CANONICAL_HTTP_CONNECTIONS
            task.metadata["connection_policy"] = "canonical-32"
            task.metadata["requested_connections"] = CANONICAL_HTTP_CONNECTIONS
            runtime.store.save_task(task)
            runtime.store.append_event(
                task.id,
                "connection_policy_engine_boundary",
                {"connections": CANONICAL_HTTP_CONNECTIONS},
            )
        original_starter(task_id)

    runtime.queue.starter = starter
