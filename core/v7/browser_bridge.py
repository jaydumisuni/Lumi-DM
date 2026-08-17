"""Persistent same-PC browser bridge for Lumi.

This bridge is transport only. All mutations terminate in runtime_contract.dispatch_rpc
and therefore operate on the same Runtime as the main window and widget.
"""
from __future__ import annotations

import asyncio
import json
import threading
import time
from typing import Any

from core.v4.api import services as v4_services

from .runtime_contract import SCHEMA, dispatch_rpc


class BrowserBridgeServer:
    def __init__(self, app, host: str = "127.0.0.1", port: int = 7001):
        self.app = app
        self.host = host
        self.port = int(port)
        self._loop: asyncio.AbstractEventLoop | None = None
        self._server: Any = None
        self._thread: threading.Thread | None = None
        self._started = threading.Event()
        self._error = ""

    @property
    def error(self) -> str:
        return self._error

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(
            target=self._run,
            name="lumi-browser-bridge",
            daemon=True,
        )
        self._thread.start()
        self._started.wait(2.5)
        if self._error:
            raise RuntimeError(self._error)

    def stop(self) -> None:
        loop = self._loop
        if not loop or not loop.is_running():
            return
        loop.call_soon_threadsafe(loop.stop)

    def _run(self) -> None:
        try:
            import websockets
        except Exception as exc:  # pragma: no cover - packaged capability path
            self._error = f"websockets unavailable: {exc}"
            self._started.set()
            return

        loop = asyncio.new_event_loop()
        self._loop = loop
        asyncio.set_event_loop(loop)

        async def bootstrap():
            self._server = await websockets.serve(
                self._handler,
                self.host,
                self.port,
                max_size=4 * 1024 * 1024,
                ping_interval=None,
                close_timeout=3,
            )

        try:
            loop.run_until_complete(bootstrap())
            self._started.set()
            loop.run_forever()
        except Exception as exc:
            self._error = str(exc)
            self._started.set()
        finally:
            try:
                if self._server is not None:
                    self._server.close()
                    loop.run_until_complete(self._server.wait_closed())
            except Exception:
                pass
            loop.close()

    async def _send(self, socket, value: dict[str, Any]) -> None:
        await socket.send(json.dumps(value, separators=(",", ":"), ensure_ascii=False))

    async def _handler(self, socket, _path=None) -> None:
        context = None
        hello_id = ""
        try:
            raw = await asyncio.wait_for(socket.recv(), timeout=8)
            hello = json.loads(str(raw))
            if hello.get("type") != "browser.hello":
                await socket.close(code=4400, reason="browser.hello required")
                return
            token = str((hello.get("payload") or {}).get("token") or "")
            context = v4_services().security.authenticate(token)
            if context is None:
                await socket.close(code=4401, reason="authentication required")
                return
            hello_id = str(hello.get("id") or "")
            await self._send(socket, {
                "type": "browser.ready",
                "reply_to": hello_id,
                "schema": SCHEMA,
                "payload": {
                    "runtime_instance": self.app.config.get("LUMI_RUNTIME_INSTANCE", ""),
                    "role": context.role,
                    "client_name": context.client_name,
                    "capabilities": {
                        "rpc": True,
                        "media_observation": True,
                        "download_handoff": True,
                        "heartbeat": True,
                    },
                },
            })

            async for raw_message in socket:
                try:
                    message = json.loads(str(raw_message))
                except Exception:
                    await self._send(socket, {"type": "browser.error", "error": "invalid JSON"})
                    continue
                message_type = str(message.get("type") or "")
                message_id = str(message.get("id") or "")
                if message_type == "browser.ping":
                    await self._send(socket, {
                        "type": "browser.pong",
                        "reply_to": message_id,
                        "schema": SCHEMA,
                        "payload": {"now": int(time.time() * 1000)},
                    })
                    continue
                if message_type != "browser.rpc":
                    await self._send(socket, {
                        "type": "browser.error",
                        "reply_to": message_id,
                        "error": "unsupported bridge message",
                    })
                    continue
                payload = message.get("payload") if isinstance(message.get("payload"), dict) else {}
                method = str(payload.get("method") or "")
                if method not in {"runtime.state", "download.status"} and not context.can_write:
                    await self._send(socket, {
                        "type": "browser.rpc.result",
                        "reply_to": message_id,
                        "ok": False,
                        "error": "client is read-only",
                    })
                    continue
                try:
                    result = dispatch_rpc(
                        self.app,
                        method,
                        payload.get("params") if isinstance(payload.get("params"), dict) else {},
                    )
                    await self._send(socket, {
                        "type": "browser.rpc.result",
                        "reply_to": message_id,
                        "schema": SCHEMA,
                        "ok": True,
                        "result": result,
                    })
                except Exception as exc:
                    await self._send(socket, {
                        "type": "browser.rpc.result",
                        "reply_to": message_id,
                        "schema": SCHEMA,
                        "ok": False,
                        "error": str(exc),
                    })
        except asyncio.TimeoutError:
            try:
                await socket.close(code=4408, reason="hello timeout")
            except Exception:
                pass
        except Exception:
            try:
                await socket.close(code=1011, reason="bridge error")
            except Exception:
                pass
