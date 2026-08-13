from __future__ import annotations

from contextlib import contextmanager
import os
from pathlib import Path
import socket
import subprocess
import sys
import time

from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parents[1]
PORT = 7000


def wait_port(timeout: float = 20.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", PORT), timeout=0.4):
                return
        except OSError:
            time.sleep(0.1)
    raise AssertionError("Lumi server did not start")


@contextmanager
def server(tmp_path: Path):
    env = os.environ.copy()
    env.update({
        "LUMIDM_DATA_DIR": str(tmp_path / "data"),
        "LUMIDM_DOWNLOAD_DIR": str(tmp_path / "downloads"),
        "LUMIDM_TEMP_DIR": str(tmp_path / "temp"),
        "PYTHONUNBUFFERED": "1",
    })
    process = subprocess.Popen(
        [sys.executable, "server.py", "--host", "127.0.0.1", "--port", str(PORT)],
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        wait_port()
        yield process
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()


def test_technician_loader_diagnostic(tmp_path: Path) -> None:
    for name in ("data", "downloads", "temp"):
        (tmp_path / name).mkdir()

    with server(tmp_path):
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page(viewport={"width": 1440, "height": 900})
            console = []
            errors = []
            responses = []
            page.on("console", lambda message: console.append((message.type, message.text)))
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.on(
                "response",
                lambda response: responses.append((response.status, response.url))
                if "/api/v5/firmware" in response.url or "/api/v5/os/" in response.url
                else None,
            )

            page.goto(f"http://127.0.0.1:{PORT}", wait_until="domcontentloaded")
            page.locator("#app-shell").wait_for(state="visible", timeout=20_000)
            page.locator(".nav-group-toggle").click()
            page.locator('.nav-item[data-view="firmware"]').click()
            page.wait_for_timeout(2500)

            print("FIRMWARE_VIEW_CLASS=", page.locator("#view-firmware").get_attribute("class"))
            print("FIRMWARE_HTML=", page.locator("#view-firmware").inner_html()[:4000])
            print("FIRMWARE_RESPONSES=", responses)
            print("PAGE_ERRORS=", errors)
            print("CONSOLE_ERRORS=", [item for item in console if item[0] == "error"])
            print("OPEN_FIRMWARE_TYPE=", page.evaluate("typeof openFirmwareView"))
            print("CATALOGUE_STATUS=", page.evaluate("fetch('/api/v5/firmware/catalogue').then(r => r.status)"))

            assert page.locator("#view-firmware").get_attribute("class") and "active" in page.locator("#view-firmware").get_attribute("class")
            assert page.locator("#view-firmware .firmware-shell").count() == 1
            assert not errors
            browser.close()
